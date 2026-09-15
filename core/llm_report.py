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
    base_url = (
        os.getenv("OPENROUTER_BASE_URL", _DEFAULT_BASE_URL).strip() or _DEFAULT_BASE_URL
    )
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
  - Identifies upskilling needs ONLY for capabilities where is_gap=True.
  - If there are no deterministic capability gaps, explicitly state that no
    capability gaps were identified.
  - When no gaps exist, you may describe lower-similarity covered capabilities
    as relatively weaker alignments, but do NOT call them upskilling needs,
    deficiencies, or gaps.
  - Where genuine gaps exist, order them by severity.
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
  - Treat is_gap as authoritative for whether a capability is a gap.
  - Never describe a capability with is_gap=False as an upskilling requirement,
    deficiency, or capability gap.
  - If every capability has is_gap=False, state that all evaluated capabilities
    meet the deterministic coverage threshold.

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

_TEAM_SYSTEM = """\
You are a workforce capability analyst preparing an executive team assessment
for a Deloitte project staffing report.

You receive:
- the project name and description
- all project roles
- the employee assigned to each role
- each assignment's deterministic match score
- deterministic capability-fit results produced by the embedding model
- team-level capability evidence derived from those fit results
- relevant employee project and industry experience where recorded

Your job is to interpret the supplied evidence for a resource manager making
a staffing decision.

The report must answer five practical questions:

1. Is this proposed team suitable overall?
2. What are the team's strongest capability characteristics?
3. What are the most important delivery or capability risks?
4. Which capability gaps matter most?
5. Where is management judgement required before confirming the team?

Focus on TEAM-LEVEL insight rather than repeating individual employee scores.

INTERPRETING MATCH SCORE VS CAPABILITY COVERAGE

The deterministic overall match score and capability-level coverage are
different signals.

- Overall match reflects broad semantic similarity between the employee profile
  and the role requirements.
- Capability coverage evaluates each required capability individually using the
  deterministic gap threshold.

A high overall match does NOT mean every required capability is covered.

If an assignment has a relatively high overall match but several capability
gaps, explicitly explain the difference rather than presenting the evidence as
contradictory.

For example, describe this as:
"Broad profile alignment is relatively strong, but capability-level evidence
shows material gaps in several required areas."

Do not call an assignment strong solely because its overall match percentage
is high.

OVERALL SUITABILITY

Choose exactly one rating:

- "Strong"
- "Suitable with Considerations"
- "Requires Review"

Then provide 2-3 concise supporting points explaining why.

The supporting points should answer what the resource manager should conclude
from the evidence.

Where appropriate, state whether the proposed team:
- can proceed based on the supplied capability evidence
- can proceed subject to specific management considerations
- should be reviewed before staffing is confirmed

Do not automatically reject a team because gaps exist.

KEY STRENGTHS

Provide up to 4 concise points describing meaningful team strengths.

Examples of useful insights include:
- strong coverage of high-importance capabilities
- complementary capability coverage across team members
- several roles showing strong alignment with their critical requirements
- absence of material gaps in critical capability areas

Do not simply list the highest percentages.

KEY RISKS

Provide up to 4 concise points describing decision-relevant risks.

When multiple roles have weak capability coverage, do not group them together
unless their broader match evidence tells the same story.

Distinguish between:
- high overall match + weak capability coverage
- low overall match + weak capability coverage

Do not describe both as having "high overall profile match" unless that is
supported by the supplied deterministic scores for each role.

Prioritise:
- capabilities classified as High team risk
- capabilities with no adequate coverage demonstrated in the supplied
  role-assignment evidence
- capability areas affecting multiple roles
- roles with widespread capability-level gaps
- important capability coverage concentrated in one employee
- situations where overall match and capability coverage provide different signals

Write risks primarily at TEAM or CAPABILITY level.

Prefer:
"The supplied role-assignment evidence shows weak security capability coverage."

Over:
"Employee X has a low capability score."

Only name an employee when the specific assignment itself requires management
review.

PRIORITY CAPABILITY GAPS

Return only material gaps.

Each gap must contain:
- capability
- priority: "High", "Medium", or "Low"
- insight: one concise explanation of why the gap matters

Use the supplied deterministic team risk priority as the primary guide.

Risk priority considers:
- capability importance weight
- whether adequate coverage is demonstrated in the supplied role-assignment evidence
- whether the gap affects multiple roles
- whether the affected role has widespread capability gaps

Do not downgrade a supplied High team-risk capability simply because its
individual capability weight is below 4.

Do not include minor gaps unless they materially affect the team assessment.

MANAGEMENT JUDGEMENT

Provide up to 4 concise points identifying matters that cannot be decided from
the matching score alone and should be reviewed by a resource manager.

Examples:
- capability evidence is strong but experience evidence is limited
- an important capability depends heavily on one team member
- a role contains a material high-weight gap despite otherwise reasonable fit
- recorded data does not provide enough evidence to make a confident conclusion

RECOMMENDED ACTIONS

Provide up to 3 practical actions directly linked to the supplied evidence.

Every recommended action must directly correspond to a risk, capability gap,
concentration issue, or management judgement item identified above.

Prefer specific actions such as:
- validate practical experience where recorded evidence conflicts with capability fit
- establish secondary coverage for a concentrated capability
- confirm whether uncovered capability can be supported elsewhere in the team
- target development against a named capability gap

Avoid generic recommendations such as:
- provide more training
- monitor the project
- review the team

unless the supplied evidence specifically supports that action.

Do not recommend replacing a named employee.

STRICT RULES:

- Use ONLY the supplied data.
- Do not invent capabilities, experience, certifications, project facts, or risks.
- Do not calculate or invent a new team score.
- Do not recommend replacing employees.
- Do not claim similarity proves mastery of a capability.
- Avoid repeating percentages already presented elsewhere in the report.
- Only mention a percentage when essential to explain a material issue.
- Treat deterministic matching data as evidence, not proof of competence.
- Do not claim that a capability is absent across the entire proposed team
  unless every selected team member has actually been evaluated against that
  capability.
- Current team-level capability evidence is derived from assigned-role fit
  results. Phrase coverage conclusions as evidence demonstrated in the supplied
  assignments, not as proof that no other team member possesses the capability.
- Focus on interpretation and decision support.
- Objective, professional tone.
- No marketing language or superlatives.
- Each point must be concise.
- Do not use markdown formatting inside strings.

You must respond with a single JSON object exactly in this shape:

{
  "overall_suitability": {
    "rating": "Strong",
    "points": [
      "Concise point",
      "Concise point"
    ]
  },
  "key_strengths": [
    "Concise point",
    "Concise point"
  ],
  "key_risks": [
    "Concise point",
    "Concise point"
  ],
  "priority_capability_gaps": [
    {
      "capability": "Capability name",
      "priority": "High",
      "insight": "Concise explanation"
    }
  ],
  "management_judgement": [
    "Concise point"
  ],
  "recommended_actions": [
    "Concise action"
  ]
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
    cap_lines = (
        "\n".join(_format_capability_line(c) for c in role_capabilities) or "  (none)"
    )
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
    strongest = max(
        covered, key=lambda g: float(g.get("similarity", 0.0)), default=None
    )

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
            if worst_gap
            else None
        ),
        "strongest_match": (
            {
                "capability": strongest.get("cap_name", ""),
                "weight": strongest.get("weight", 1),
                "skill": strongest.get("best_match_skill"),
                "similarity": strongest.get("similarity", 0.0),
            }
            if strongest
            else None
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
    cap_lines = (
        "\n".join(_format_capability_line(c) for c in role_capabilities) or "  (none)"
    )
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
            if wg
            else "none"
        )
        sm_str = (
            f"{sm['capability']} (weight {sm['weight']}, "
            f"skill '{sm['skill']}', sim {sm['similarity']:.2f})"
            if sm
            else "none"
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


def _build_team_prompt(
    project_context: dict,
    team_entries: list[dict],
) -> list[dict]:
    """
    Build the team-level executive assessment prompt.

    Uses the existing deterministic analyse_fit() results and derives
    team-level capability evidence before asking the LLM to interpret it.
    """

    project_name = project_context.get("name", "(untitled project)")
    project_description = (project_context.get("description", "") or "").strip()

    assignment_blocks: list[str] = []

    # ------------------------------------------------------------
    # Team-level deterministic evidence
    # ------------------------------------------------------------

    capability_evidence: dict[str, dict] = {}

    total_gaps = 0
    high_priority_gaps: list[dict] = []

    # Stores role-level evidence so team risks can consider more than
    # capability weight alone.
    role_gap_stats: dict[str, dict] = {}
    role_signal_lines: list[str] = []

    for entry in team_entries:
        role_title = entry.get("role_title", "")
        employee = entry.get("employee", {}) or {}
        match_score = float(entry.get("match_score", 0.0))
        fit_report = entry.get("fit_report", []) or []

        gaps = [item for item in fit_report if item.get("is_gap")]

        covered = [item for item in fit_report if not item.get("is_gap")]

        total_gaps += len(gaps)

        # --------------------------------------------------------
        # Role-level deterministic evidence
        # --------------------------------------------------------

        capability_count = len(fit_report)
        gap_count = len(gaps)
        covered_count = len(covered)

        gap_ratio = gap_count / capability_count if capability_count else 0.0

        high_weight_gap_count = sum(
            1 for item in gaps if int(item.get("weight", 1)) >= 4
        )

        role_gap_stats[role_title] = {
            "capability_count": capability_count,
            "covered_count": covered_count,
            "gap_count": gap_count,
            "gap_ratio": gap_ratio,
            "high_weight_gap_count": high_weight_gap_count,
        }

        # Explicitly flag cases where broad embedding match and
        # capability-level coverage tell different stories.
        if match_score >= 0.75 and gap_ratio >= 0.60:
            interpretation = (
                "Broad profile match is relatively high, but capability-level "
                "coverage is weak. These signals must be explained separately."
            )

        elif match_score < 0.60 and gap_ratio >= 0.60:
            interpretation = (
                "Both broad profile match and capability-level coverage are weak."
            )

        elif gap_count == 0:
            interpretation = (
                "No deterministic capability gaps identified."
            )

        elif high_weight_gap_count > 0:
            interpretation = (
                "One or more high-importance capability gaps require attention."
            )

        else:
            interpretation = (
                "Some capability-level gaps are present."
            )

        role_signal_lines.append(
            f"- {role_title}: "
            f"{covered_count} of {capability_count} capabilities covered; "
            f"{gap_count} gaps; "
            f"{high_weight_gap_count} high-weight gaps. "
            f"{interpretation}"
        )

        # Strongest capability alignments for this role
        strongest = sorted(
            covered,
            key=lambda item: (
                int(item.get("weight", 1)),
                float(item.get("similarity", 0.0)),
            ),
            reverse=True,
        )[:3]

        # Most important gaps for this role:
        # higher weight first, then lower similarity
        weakest = sorted(
            gaps,
            key=lambda item: (
                int(item.get("weight", 1)),
                -float(item.get("similarity", 0.0)),
            ),
            reverse=True,
        )[:3]

        strongest_text = (
            ", ".join(
                f"{item.get('cap_name', '')} "
                f"(weight {item.get('weight', 1)}, "
                f"similarity "
                f"{float(item.get('similarity', 0.0)):.2f})"
                for item in strongest
            )
            if strongest
            else "none recorded"
        )

        gap_text = (
            ", ".join(
                f"{item.get('cap_name', '')} "
                f"(weight {item.get('weight', 1)}, "
                f"similarity "
                f"{float(item.get('similarity', 0.0)):.2f})"
                for item in weakest
            )
            if weakest
            else "none"
        )

        project_exp = employee.get("project_experience", []) or []
        industry_exp = employee.get("industry_experience", []) or []
        prior_roles = employee.get("prior_roles", []) or []

        assignment_blocks.append(
            f"Role: {role_title}\n"
            f"Assigned employee: {employee.get('name', '')}\n"
            f"Current title: {employee.get('title', '')}\n"
            f"Level: {employee.get('role_level', '')}\n"
            f"Deterministic overall match: "
            f"{match_score * 100:.0f}%\n"
            f"Capabilities covered: {len(covered)}\n"
            f"Capability gaps: {len(gaps)}\n"
            f"Strongest important alignments: "
            f"{strongest_text}\n"
            f"Key gaps: {gap_text}\n"
            f"Prior roles: "
            f"{', '.join(prior_roles) if prior_roles else '(none recorded)'}\n"
            f"Project experience: "
            f"{', '.join(project_exp) if project_exp else '(none recorded)'}\n"
            f"Industry experience: "
            f"{', '.join(industry_exp) if industry_exp else '(none recorded)'}"
        )

        # --------------------------------------------------------
        # Aggregate each capability across the proposed team.
        # --------------------------------------------------------

        employee_name = employee.get("name", "") or employee.get("id", "Unknown")

        for item in fit_report:
            capability_name = item.get("cap_name", "")
            if not capability_name:
                continue

            weight = int(item.get("weight", 1))
            similarity = float(item.get("similarity", 0.0))
            is_gap = bool(item.get("is_gap"))

            evidence = capability_evidence.setdefault(
                capability_name,
                {
                    "max_weight": weight,
                    "required_roles": set(),
                    "covered_by": set(),
                    "gap_roles": set(),
                    "best_similarity": 0.0,
                },
            )

            evidence["max_weight"] = max(
                evidence["max_weight"],
                weight,
            )

            evidence["required_roles"].add(role_title)

            evidence["best_similarity"] = max(
                evidence["best_similarity"],
                similarity,
            )

            if is_gap:
                evidence["gap_roles"].add(role_title)

                if weight >= 4:
                    high_priority_gaps.append(
                        {
                            "role": role_title,
                            "capability": capability_name,
                            "weight": weight,
                            "similarity": similarity,
                        }
                    )
            else:
                evidence["covered_by"].add(employee_name)

    # ------------------------------------------------------------
    # Convert aggregated evidence into prompt-friendly text
    # ------------------------------------------------------------

    capability_lines: list[str] = []

    for capability_name, evidence in sorted(
        capability_evidence.items(),
        key=lambda pair: (
            pair[1]["max_weight"],
            len(pair[1]["gap_roles"]),
        ),
        reverse=True,
    ):
        covered_by = sorted(evidence["covered_by"])
        required_roles = sorted(evidence["required_roles"])
        gap_roles = sorted(evidence["gap_roles"])

        # --------------------------------------------------------
        # Determine a deterministic team-level risk signal.
        #
        # This does NOT change analyse_fit() or the gap threshold.
        # It only prioritises gaps that already exist.
        # --------------------------------------------------------

        if not gap_roles:
            risk_priority = "No material gap"

        else:
            severe_role_gap = any(
                role_gap_stats.get(role, {}).get(
                    "gap_ratio",
                    0.0,
                )
                >= 0.60
                for role in gap_roles
            )

            no_team_coverage = len(covered_by) == 0
            affects_multiple_roles = len(gap_roles) >= 2
            high_importance = evidence["max_weight"] >= 4

            if no_team_coverage and (
                high_importance or affects_multiple_roles or severe_role_gap
            ):
                risk_priority = "High"

            elif high_importance or no_team_coverage or affects_multiple_roles:
                risk_priority = "Medium"

            else:
                risk_priority = "Low"

        capability_lines.append(
            f"- {capability_name}: "
            f"team risk priority {risk_priority}; "
            f"max importance weight {evidence['max_weight']}; "
            f"required by {len(required_roles)} role(s); "
            f"covered by {len(covered_by)} assigned employee(s); "
            f"gap in {len(gap_roles)} role(s); "
            f"best similarity {evidence['best_similarity']:.2f}"
        )

    # Important capability areas that depend on only one team member.
    concentration_lines: list[str] = []

    for capability_name, evidence in capability_evidence.items():
        if (
            evidence["max_weight"] >= 4
            and len(evidence["required_roles"]) > 1
            and len(evidence["covered_by"]) == 1
        ):
            employee_name = next(iter(evidence["covered_by"]))

            concentration_lines.append(
                f"- {capability_name}: important capability required "
                f"across {len(evidence['required_roles'])} roles but "
                f"adequate coverage is demonstrated by only "
                f"{employee_name}."
            )

    assignments_section = (
        "\n\n".join(assignment_blocks) if assignment_blocks else "(no assignments)"
    )

    capability_section = (
        "\n".join(capability_lines) if capability_lines else "(no capability evidence)"
    )

    concentration_section = (
        "\n".join(concentration_lines)
        if concentration_lines
        else "No material concentration risk identified from the supplied data."
    )

    role_signals_section = (
        "\n".join(role_signal_lines)
        if role_signal_lines
        else "(no role-level evidence)"
    )

    team_evidence = (
        f"Team size: {len(team_entries)}\n"
        f"Total deterministic capability gaps across role assignments: "
        f"{total_gaps}\n"
        f"High-priority gaps in weight-4 or weight-5 capabilities: "
        f"{len(high_priority_gaps)}"
    )

    user = (
        f"PROJECT\n"
        f"Name: {project_name}\n"
        f"Description: {project_description}\n\n"
        f"PROPOSED TEAM\n"
        f"{assignments_section}\n\n"
        f"TEAM-LEVEL DETERMINISTIC EVIDENCE\n"
        f"{team_evidence}\n\n"
        f"ROLE-LEVEL COVERAGE SIGNALS\n"
        f"{role_signals_section}\n\n"
        f"CAPABILITY COVERAGE ACROSS THE TEAM\n"
        f"{capability_section}\n\n"
        f"POTENTIAL CAPABILITY CONCENTRATION RISKS\n"
        f"{concentration_section}\n\n"
        f"Interpret this evidence and generate the executive team assessment. "
        f"Do not simply restate the figures. "
        f"Respond with only the required JSON object."
    )

    return [
        {
            "role": "system",
            "content": _TEAM_SYSTEM,
        },
        {
            "role": "user",
            "content": user,
        },
    ]


# ── Schema validation ─────────────────────────────────────────────────────────

# Common typographic characters LLMs emit (smart quotes, non-breaking hyphens,
# en/em dashes, ellipses). We normalise to plain ASCII so downstream consumers
# (CSV export, copy-paste into government templates, string-equality tests)
# never see surprising bytes regardless of which model is hot-swapped in.
_ASCII_REPLACEMENTS = {
    "\u2010": "-",  # hyphen
    "\u2011": "-",  # non-breaking hyphen
    "\u2012": "-",  # figure dash
    "\u2013": "-",  # en dash
    "\u2014": "-",  # em dash
    "\u2018": "'",  # left single quote
    "\u2019": "'",  # right single quote / apostrophe
    "\u201a": "'",  # single low-9 quote
    "\u201b": "'",  # single high-reversed-9 quote
    "\u201c": '"',  # left double quote
    "\u201d": '"',  # right double quote
    "\u201e": '"',  # double low-9 quote
    "\u201f": '"',  # double high-reversed-9 quote
    "\u2026": "...",  # horizontal ellipsis
    "\u00a0": " ",  # non-breaking space
}


def _sanitise_text(text: str) -> str:
    """Normalise common non-ASCII typographic characters to ASCII equivalents.

    Any remaining non-ASCII bytes are stripped. This keeps the report safe for
    plain-text consumers without losing meaning — the replacements above cover
    every non-ASCII character observed across tested models (DeepSeek, Mercury).
    """
    if not text:
        return text
    for src, dst in _ASCII_REPLACEMENTS.items():
        text = text.replace(src, dst)
    # Drop anything still non-ASCII (rare; defensive catch-all).
    return text.encode("ascii", "ignore").decode("ascii")


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

    return {"overall_fit_score": score, "report": _sanitise_text(report.strip())}


def _validate_auto_response(raw: dict, valid_employee_ids: list[str]) -> dict:
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
        "rationale": _sanitise_text(rationale.strip()),
    }


def _validate_team_response(raw: dict) -> dict:
    """Validate and normalise the executive team-summary response."""

    if not isinstance(raw, dict):
        raise LLMReportError(f"Expected a JSON object, got {type(raw).__name__}.")

    # ------------------------------------------------------------
    # Overall suitability
    # ------------------------------------------------------------

    overall = raw.get("overall_suitability")

    if not isinstance(overall, dict):
        raise LLMReportError("'overall_suitability' must be an object.")

    rating = overall.get("rating")

    valid_ratings = {
        "Strong",
        "Suitable with Considerations",
        "Requires Review",
    }

    if rating not in valid_ratings:
        raise LLMReportError(
            "'overall_suitability.rating' must be one of: "
            "'Strong', 'Suitable with Considerations', "
            "or 'Requires Review'."
        )

    points = overall.get("points")

    if not isinstance(points, list) or not points:
        raise LLMReportError("'overall_suitability.points' must be a non-empty list.")

    if len(points) > 3:
        raise LLMReportError(
            "'overall_suitability.points' must contain no more than 3 items."
        )

    for point in points:
        if not isinstance(point, str) or not point.strip():
            raise LLMReportError(
                "Every overall suitability point must be a non-empty string."
            )

    # ------------------------------------------------------------
    # Standard bullet-list sections
    # ------------------------------------------------------------

    list_fields = {
        "key_strengths": 4,
        "key_risks": 4,
        "management_judgement": 4,
        "recommended_actions": 3,
    }

    validated_lists = {}

    for field, max_items in list_fields.items():
        value = raw.get(field)

        if not isinstance(value, list):
            raise LLMReportError(f"'{field}' must be a list.")

        if len(value) > max_items:
            raise LLMReportError(
                f"'{field}' must contain no more than " f"{max_items} items."
            )

        cleaned_items = []

        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise LLMReportError(
                    f"Every item in '{field}' must be " f"a non-empty string."
                )

            cleaned_items.append(_sanitise_text(item.strip()))

        validated_lists[field] = cleaned_items

    # ------------------------------------------------------------
    # Priority capability gaps
    # ------------------------------------------------------------

    gaps = raw.get("priority_capability_gaps")

    if not isinstance(gaps, list):
        raise LLMReportError("'priority_capability_gaps' must be a list.")

    if len(gaps) > 5:
        raise LLMReportError(
            "'priority_capability_gaps' must contain " "no more than 5 items."
        )

    validated_gaps = []

    valid_priorities = {
        "High",
        "Medium",
        "Low",
    }

    for gap in gaps:

        if not isinstance(gap, dict):
            raise LLMReportError("Each priority capability gap must be an object.")

        capability = gap.get("capability")
        priority = gap.get("priority")
        insight = gap.get("insight")

        if not isinstance(capability, str) or not capability.strip():
            raise LLMReportError(
                "Each capability gap must contain " "a non-empty 'capability'."
            )

        if priority not in valid_priorities:
            raise LLMReportError(
                "Capability gap priority must be " "'High', 'Medium', or 'Low'."
            )

        if not isinstance(insight, str) or not insight.strip():
            raise LLMReportError(
                "Each capability gap must contain " "a non-empty 'insight'."
            )

        validated_gaps.append(
            {
                "capability": _sanitise_text(capability.strip()),
                "priority": priority,
                "insight": _sanitise_text(insight.strip()),
            }
        )

    return {
        "overall_suitability": {
            "rating": rating,
            "points": [_sanitise_text(point.strip()) for point in points],
        },
        "key_strengths": validated_lists["key_strengths"],
        "key_risks": validated_lists["key_risks"],
        "priority_capability_gaps": validated_gaps,
        "management_judgement": validated_lists["management_judgement"],
        "recommended_actions": validated_lists["recommended_actions"],
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


async def generate_team_summary(
    project_context: dict,
    team_entries: list[dict],
) -> dict:
    """
    Generate a structured AI executive assessment of the proposed project team.

    Returns:
    {
        "overall_suitability": {
            "rating": str,
            "points": list[str],
        },
        "key_strengths": list[str],
        "key_risks": list[str],
        "priority_capability_gaps": list[dict],
        "management_judgement": list[str],
        "recommended_actions": list[str],
    }

    The LLM interprets deterministic role-match and capability-fit results.
    It does not calculate new fit scores.
    """

    if not team_entries:
        raise LLMReportError("No team assignments were provided.")

    messages = _build_team_prompt(
        project_context=project_context,
        team_entries=team_entries,
    )

    content = await _call_model(messages)

    raw = _parse_json_content(content)

    return _validate_team_response(raw)


__all__ = [
    "ConfigError",
    "LLMReportError",
    "generate_fit_report",
    "generate_team_summary",
    "select_best_candidate",
    "_build_hands_on_prompt",
    "_build_auto_prompt",
    "_build_team_prompt",
    "_validate_hands_on_response",
    "_validate_auto_response",
    "_validate_team_response",
    "_condense_fit",
    "_sanitise_text",
]
