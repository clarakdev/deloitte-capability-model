"""
LLM gap-analysis reports and auto-selection via OpenRouter.

OpenRouter is OpenAI-compatible, so we use the official `openai` SDK pointed
at https://openrouter.ai/api/v1. The model is hot-swappable via the
`OPENROUTER_MODEL` env var — no code change required.

Two public async entry points
-----------------------------
- generate_fit_report(role_capabilities, employee, fit_report)
    → {overall_fit_score: int 0–100, report: str}

- select_best_candidate(role_capabilities, top_candidates_with_fit)
    → {selected_employee_id: str, rationale: str}

Both use `response_format={"type": "json_object"}` and validate the returned
JSON against their schema, raising `LLMReportError` on any deviation.

The prompt builders (`_build_hands_on_prompt`, `_build_auto_prompt`) and the
system prompts are pure sync functions so they can be unit-tested without an
API key.

Determinism
-----------
The LLM is never asked to re-judge fit from raw text. It interprets the
deterministic `analyse_fit()` output (per-capability similarity + weight +
is_gap) that the caller already computed via embeddings. The LLM's value-add
is qualitative interpretation and (in auto mode) tie-breaking across
candidates — not ranking.
"""

from __future__ import annotations

import json
import os
from typing import Any

from openai import AsyncOpenAI

# ── Configuration (read once at import; changes require a restart) ────────────

_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
_DEFAULT_MODEL = "deepseek/deepseek-v4-flash"


class ConfigError(RuntimeError):
    """Raised when required environment variables are missing."""


class LLMReportError(RuntimeError):
    """Raised when the LLM response is missing, malformed, or schema-invalid."""


def _read_env() -> tuple[str, str, str]:
    """Return (api_key, base_url, model) from environment, or raise."""
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise ConfigError(
            "OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill "
            "in your key from https://openrouter.ai/keys."
        )
    base_url = os.getenv("OPENROUTER_BASE_URL", _DEFAULT_BASE_URL).strip() or _DEFAULT_BASE_URL
    model = os.getenv("OPENROUTER_MODEL", _DEFAULT_MODEL).strip() or _DEFAULT_MODEL
    return api_key, base_url, model


# Lazy singleton — created on first use so importing this module never fails
# even without a key. ConfigError surfaces only when an actual call is made.
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key, base_url, _model = _read_env()
        _client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    return _client


# ── System prompts (objective, factual, rule-based) ───────────────────────────

_HANDS_ON_SYSTEM = """\
You are a skill-gap analyst for a Deloitte project manager.

You receive a role's required capabilities (each with a 1–5 importance weight
and an ESCO description) and one candidate employee's profile, plus a
pre-computed per-capability fit table. The fit table gives, for each
capability, the employee's closest recorded skill and a cosine similarity
score in [0,1] (0 = no overlap, 1 = exact match).

Your job is to write a SHORT, OBJECTIVE report (1–2 paragraphs, plain text)
that:
  - States where the employee matches the role's requirements.
  - States where the employee would need to upskill, ordered by severity.
    Severity fuses similarity AND weight: a low similarity on a weight-5
    capability is a severe gap; a low similarity on a weight-1 capability is
    minor.
  - Ends with a single overall fit score from 0 to 100 (integer).

STRICT RULES:
  - Use ONLY the data provided. Do not invent skills, certifications, or
    experience the employee does not have.
  - Do NOT claim the employee holds a certified competency. Employee skills
    are free-text names; the similarity score is a proxy for relevance, not
    proof of mastery.
  - Objective, factual tone. No marketing language, no enthusiasm, no
    superlatives ("excellent", "perfect", "outstanding" are forbidden).
  - No markdown, no bullet lists, no headings. Plain prose only.
  - If the employee has no recorded skills, say so and base the report on
    the role requirements alone.

You must respond with a single JSON object, exactly this shape:
{
  "overall_fit_score": <integer 0-100>,
  "report": "<1-2 paragraphs of plain text>"
}
"""

_AUTO_SYSTEM = """\
You are selecting the best-fit employee for a Deloitte project role from the
top 5 candidates produced by an embedding-based ranker.

For each candidate you receive: their rank (1 = highest embedding overlap),
their embedding match_score (0–1), and a condensed gap summary (count of
gaps, their worst gap weighted by importance, and their strongest match).

You may select any of the 5. You are encouraged to override the rank-1 pick
ONLY when a lower-ranked candidate has materially better fit on a
high-weight (4–5) capability or materially fewer severe gaps. Otherwise,
prefer the rank-1 pick — the embedding ranker is reliable.

STRICT RULES:
  - Use ONLY the data provided. Do not invent skills or experience.
  - Objective, factual tone. No marketing language, no enthusiasm.
  - Justify your pick in ONE paragraph: name the chosen employee, state the
    deciding factor, and (if you overrode rank 1) say why.
  - No markdown, no bullet lists. Plain prose only.

You must respond with a single JSON object, exactly this shape:
{
  "selected_employee_id": "<one of the provided employee ids>",
  "rationale": "<one paragraph of plain text>"
}
"""

# ── Prompt builders (pure, sync, unit-testable) ───────────────────────────────


def _format_capability_line(cap: dict) -> str:
    """One human-readable line per capability for the prompt."""
    cap_id = cap.get("cap_id", "")
    name = cap.get("name", "") or cap.get("cap_name", "")
    weight = cap.get("weight", 1)
    desc = (cap.get("esco_description", "") or "").strip()
    inferred = "inferred" if cap.get("is_inferred") else "manual"
    desc_part = f" — {desc}" if desc else ""
    return f"- [{cap_id}] {name} (weight {weight}, {inferred}){desc_part}"


def _format_fit_line(item: dict) -> str:
    """One human-readable line per capability from analyse_fit() output."""
    cap_name = item.get("cap_name", "")
    weight = item.get("weight", 1)
    best = item.get("best_match_skill")
    sim = item.get("similarity", 0.0)
    is_gap = "GAP" if item.get("is_gap") else "covered"
    best_part = best if best else "(none recorded)"
    return (
        f"- {cap_name} (weight {weight}): closest skill '{best_part}', "
        f"similarity {sim:.2f} → {is_gap}"
    )


def _format_employee_profile(emp: dict) -> str:
    """Render the employee fields the LLM is allowed to consider."""
    skills = emp.get("skills", []) or []
    by_cat: dict[str, list[str]] = {}
    for s in skills:
        cat = s.get("category", "Other") or "Other"
        by_cat.setdefault(cat, []).append(s["name"])

    skills_block = (
        "\n".join(f"  {cat}: {', '.join(names)}" for cat, names in by_cat.items())
        if by_cat
        else "  (no skills recorded)"
    )

    certs = emp.get("certifications", []) or []
    prior = emp.get("prior_roles", []) or []
    tools = emp.get("tools", []) or []

    return (
        f"Name: {emp.get('name', '')}\n"
        f"Current title: {emp.get('title', '')}\n"
        f"Role level: {emp.get('role_level', '')}\n"
        f"Years of experience: {emp.get('years_experience', 'unknown')}\n"
        f"Summary: {emp.get('summary', '')}\n"
        f"Skills by category:\n{skills_block}\n"
        f"Prior roles: {', '.join(prior) if prior else '(none)'}\n"
        f"Tools: {', '.join(tools) if tools else '(none)'}\n"
        f"Certifications: {', '.join(certs) if certs else '(none)'}"
    )


def _build_hands_on_prompt(
    role_context: dict,
    role_capabilities: list[dict],
    employee: dict,
    fit_report: list[dict],
) -> list[dict]:
    """
    Build the hands-on fit-report message list.

    `role_context` may contain {"title": ..., "description": ...} (the role
    dict from project.json). `role_capabilities` and `fit_report` are the
    capability list and the `analyse_fit()` output respectively.
    """
    cap_lines = "\n".join(_format_capability_line(c) for c in role_capabilities) or "  (none)"
    fit_lines = "\n".join(_format_fit_line(i) for i in fit_report) or "  (none)"
    profile = _format_employee_profile(employee)

    role_title = role_context.get("title", "(untitled role)")
    role_desc = (role_context.get("description", "") or "").strip()

    user = (
        f"ROLE\n"
        f"Title: {role_title}\n"
        f"Description: {role_desc}\n\n"
        f"REQUIRED CAPABILITIES\n{cap_lines}\n\n"
        f"EMPLOYEE PROFILE\n{profile}\n\n"
        f"PRE-COMPUTED FIT TABLE (from embedding similarity)\n{fit_lines}\n\n"
        f"Write the report and the overall fit score now. "
        f"Respond with only the JSON object."
    )
    return [
        {"role": "system", "content": _HANDS_ON_SYSTEM},
        {"role": "user", "content": user},
    ]


def _condense_fit(fit_report: list[dict]) -> dict:
    """Reduce a fit_report to the few signals the auto prompt needs per candidate."""
    gaps = [g for g in fit_report if g.get("is_gap")]
    covered = [g for g in fit_report if not g.get("is_gap")]

    def _weighted_sim(g: dict) -> float:
        return float(g.get("similarity", 0.0)) * int(g.get("weight", 1))

    worst_gap = max(gaps, key=_weighted_sim, default=None)
    strongest = max(covered, key=lambda g: float(g.get("similarity", 0.0)), default=None)

    return {
        "gap_count": len(gaps),
        "covered_count": len(covered),
        "worst_gap": (
            {
                "capability": worst_gap.get("cap_name", ""),
                "weight": worst_gap.get("weight", 1),
                "closest_skill": worst_gap.get("best_match_skill"),
                "similarity": worst_gap.get("similarity", 0.0),
            }
            if worst_gap else None
        ),
        "strongest_match": (
            {
                "capability": strongest.get("cap_name", ""),
                "weight": strongest.get("weight", 1),
                "skill": strongest.get("best_match_skill"),
                "similarity": strongest.get("similarity", 0.0),
            }
            if strongest else None
        ),
    }


def _build_auto_prompt(
    role_context: dict,
    role_capabilities: list[dict],
    top_candidates_with_fit: list[dict],
) -> list[dict]:
    """
    Build the auto-selection message list.

    Each entry in `top_candidates_with_fit` must be:
        {
            "rank": int,                  # 1 = highest embedding overlap
            "employee": dict,             # the employee profile
            "match_score": float,         # embedding rank score (0–1)
            "fit_report": list[dict],     # analyse_fit() output for this candidate
        }
    """
    cap_lines = "\n".join(_format_capability_line(c) for c in role_capabilities) or "  (none)"
    role_title = role_context.get("title", "(untitled role)")
    role_desc = (role_context.get("description", "") or "").strip()

    candidate_blocks: list[str] = []
    for entry in top_candidates_with_fit:
        emp = entry.get("employee", {})
        rank = entry.get("rank", 0)
        score = entry.get("match_score", 0.0)
        cond = _condense_fit(entry.get("fit_report", []) or [])
        wg = cond["worst_gap"]
        sm = cond["strongest_match"]
        wg_str = (
            f"{wg['capability']} (weight {wg['weight']}, "
            f"closest '{wg['closest_skill']}', sim {wg['similarity']:.2f})"
            if wg else "none"
        )
        sm_str = (
            f"{sm['capability']} (weight {sm['weight']}, "
            f"skill '{sm['skill']}', sim {sm['similarity']:.2f})"
            if sm else "none"
        )
        candidate_blocks.append(
            f"Candidate rank {rank}: {emp.get('name', '')} "
            f"(id: {emp.get('id', '')})\n"
            f"  Embedding match score: {score:.2f}\n"
            f"  Gaps: {cond['gap_count']} | Covered: {cond['covered_count']}\n"
            f"  Worst gap: {wg_str}\n"
            f"  Strongest match: {sm_str}"
        )

    candidates_section = "\n\n".join(candidate_blocks) or "  (no candidates)"

    user = (
        f"ROLE\n"
        f"Title: {role_title}\n"
        f"Description: {role_desc}\n\n"
        f"REQUIRED CAPABILITIES\n{cap_lines}\n\n"
        f"CANDIDATES (top {len(top_candidates_with_fit)} by embedding rank)\n"
        f"{candidates_section}\n\n"
        f"Select the best-fit candidate and justify in one paragraph. "
        f"Respond with only the JSON object."
    )
    return [
        {"role": "system", "content": _AUTO_SYSTEM},
        {"role": "user", "content": user},
    ]


# ── Schema validation ─────────────────────────────────────────────────────────


def _validate_hands_on_response(raw: dict, employee_id: str | None = None) -> dict:
    """Validate and normalise the hands-on LLM response. Raises LLMReportError."""
    if not isinstance(raw, dict):
        raise LLMReportError(f"Expected a JSON object, got {type(raw).__name__}.")

    score = raw.get("overall_fit_score")
    if not isinstance(score, int) or isinstance(score, bool):
        raise LLMReportError(
            f"'overall_fit_score' must be an integer, got {type(score).__name__}."
        )
    if not 0 <= score <= 100:
        raise LLMReportError(f"'overall_fit_score' must be 0–100, got {score}.")

    report = raw.get("report")
    if not isinstance(report, str) or not report.strip():
        raise LLMReportError("'report' must be a non-empty string.")

    return {"overall_fit_score": score, "report": report.strip()}


def _validate_auto_response(
    raw: dict, valid_employee_ids: list[str]
) -> dict:
    """Validate the auto-selection response. Raises LLMReportError."""
    if not isinstance(raw, dict):
        raise LLMReportError(f"Expected a JSON object, got {type(raw).__name__}.")

    selected = raw.get("selected_employee_id")
    if not isinstance(selected, str) or not selected.strip():
        raise LLMReportError("'selected_employee_id' must be a non-empty string.")
    if selected not in valid_employee_ids:
        raise LLMReportError(
            f"'selected_employee_id' '{selected}' is not among the provided "
            f"candidates: {valid_employee_ids}."
        )

    rationale = raw.get("rationale")
    if not isinstance(rationale, str) or not rationale.strip():
        raise LLMReportError("'rationale' must be a non-empty string.")

    return {
        "selected_employee_id": selected,
        "rationale": rationale.strip(),
    }


# ── Internal API call helper ──────────────────────────────────────────────────


async def _call_model(messages: list[dict]) -> str:
    """
    Call the configured OpenRouter model with JSON mode and return the raw
    content string. Raises ConfigError if no key, LLMReportError on API failure.
    """
    try:
        client = _get_client()
    except ConfigError:
        raise  # propagate unchanged

    _, _, model = _read_env()
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,  # low — we want factual, repeatable reports
        )
    except Exception as exc:  # noqa: BLE001 — surface any API failure as 503-worthy
        raise LLMReportError(f"OpenRouter API call failed: {exc}") from exc

    content = response.choices[0].message.content
    if not content or not content.strip():
        raise LLMReportError("OpenRouter returned an empty response.")
    return content.strip()


def _parse_json_content(content: str) -> dict:
    """Parse the LLM content as a JSON object. Raises LLMReportError."""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise LLMReportError(
            f"LLM response was not valid JSON: {exc.msg}. "
            f"First 200 chars: {content[:200]!r}"
        ) from exc
    return parsed if isinstance(parsed, dict) else {"_raw": parsed}


# ── Public async entry points ─────────────────────────────────────────────────


async def generate_fit_report(
    role_context: dict,
    role_capabilities: list[dict],
    employee: dict,
    fit_report: list[dict],
) -> dict:
    """
    Generate the hands-on LLM fit report for one employee.

    Returns {"overall_fit_score": int 0–100, "report": str}.
    Raises ConfigError (missing key) or LLMReportError (API/schema failure).
    """
    messages = _build_hands_on_prompt(
        role_context=role_context,
        role_capabilities=role_capabilities,
        employee=employee,
        fit_report=fit_report,
    )
    content = await _call_model(messages)
    raw = _parse_json_content(content)
    return _validate_hands_on_response(raw, employee.get("id"))


async def select_best_candidate(
    role_context: dict,
    role_capabilities: list[dict],
    top_candidates_with_fit: list[dict],
) -> dict:
    """
    Select the best-fit candidate from the top candidates.

    `top_candidates_with_fit` shape: see `_build_auto_prompt` docstring.
    Returns {"selected_employee_id": str, "rationale": str}.
    Raises ConfigError (missing key) or LLMReportError (API/schema failure).
    """
    valid_ids = [
        str(e.get("employee", {}).get("id", ""))
        for e in top_candidates_with_fit
        if e.get("employee", {}).get("id")
    ]
    if not valid_ids:
        raise LLMReportError("No candidates with IDs were provided.")

    messages = _build_auto_prompt(
        role_context=role_context,
        role_capabilities=role_capabilities,
        top_candidates_with_fit=top_candidates_with_fit,
    )
    content = await _call_model(messages)
    raw = _parse_json_content(content)
    return _validate_auto_response(raw, valid_ids)


__all__ = [
    "ConfigError",
    "LLMReportError",
    "generate_fit_report",
    "select_best_candidate",
    "_build_hands_on_prompt",
    "_build_auto_prompt",
    "_validate_hands_on_response",
    "_validate_auto_response",
    "_condense_fit",
]
