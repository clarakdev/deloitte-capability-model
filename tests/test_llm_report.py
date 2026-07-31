"""
Tests for core.llm_report.

Three layers:
  1. Pure prompt-builder golden-string tests (no API key needed).
  2. Schema-validation tests against malformed mock LLM responses, including
     non-ASCII sanitisation (no API key needed).
  3. One integration test against the real OpenRouter API, gated on
     OPENROUTER_API_KEY being set (skipped otherwise).

The async entry points (generate_fit_report, select_best_candidate) are
exercised via the endpoint tests in test_app.py with the LLM call stubbed;
the key-gated test here covers the real API path end-to-end.
"""

from __future__ import annotations

import os

import pytest

from core.llm_report import (
    ConfigError,
    LLMReportError,
    _build_auto_prompt,
    _build_hands_on_prompt,
    _condense_fit,
    _sanitise_text,
    _validate_auto_response,
    _validate_hands_on_response,
    generate_fit_report,
    select_best_candidate,
)

# ── Fixtures (small, synthetic, no model load) ───────────────────────────────

ROLE_CTX = {
    "title": "Solution Architect",
    "description": "Defines end-to-end technical architecture and API strategy.",
}

CAPS = [
    {
        "cap_id": "http://esco/1",
        "name": "Cloud Architecture",
        "esco_description": "Design cloud infrastructure.",
        "weight": 5,
        "is_inferred": True,
    },
    {
        "cap_id": "http://esco/2",
        "name": "API Design",
        "esco_description": "Design APIs.",
        "weight": 3,
        "is_inferred": False,
    },
]

EMP = {
    "id": "EMP001",
    "name": "Uma Brown",
    "title": "Enterprise Architect",
    "role_level": "Manager",
    "years_experience": 12,
    "summary": "Cloud and integration architect.",
    "skills": [
        {"name": "Cloud Architecture", "category": "Technology Skills"},
        {"name": "Terraform", "category": "Technology Skills"},
    ],
    "prior_roles": ["Solution Architect"],
    "tools": ["Azure"],
    "certifications": ["AWS Solutions Architect"],
}

FIT = [
    {
        "cap_id": "http://esco/1",
        "cap_name": "Cloud Architecture",
        "weight": 5,
        "best_match_skill": "Cloud Architecture",
        "similarity": 0.92,
        "is_gap": False,
    },
    {
        "cap_id": "http://esco/2",
        "cap_name": "API Design",
        "weight": 3,
        "best_match_skill": "Terraform",
        "similarity": 0.31,
        "is_gap": True,
    },
]


# ── 1. Prompt-builder golden-string tests ─────────────────────────────────────


def test_hands_on_prompt_returns_system_then_user():
    msgs = _build_hands_on_prompt(ROLE_CTX, CAPS, EMP, FIT)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


def test_hands_on_prompt_system_enforces_objective_tone():
    msgs = _build_hands_on_prompt(ROLE_CTX, CAPS, EMP, FIT)
    sys_prompt = msgs[0]["content"]
    # The tone rules that make the report defensible to the client.
    assert "skill-gap analyst" in sys_prompt
    assert "objective" in sys_prompt.lower()
    assert "no marketing" in sys_prompt.lower() or "no enthusiasm" in sys_prompt.lower()
    assert "JSON" in sys_prompt  # must demand structured output


def test_hands_on_prompt_user_contains_role_and_employee_and_fit():
    user = _build_hands_on_prompt(ROLE_CTX, CAPS, EMP, FIT)[1]["content"]
    # Role context
    assert "Solution Architect" in user
    # Capabilities with weights + inferred flag
    assert "Cloud Architecture (weight 5" in user
    assert "inferred" in user
    # Employee profile
    assert "Uma Brown" in user
    assert "12" in user  # years_experience
    assert "AWS Solutions Architect" in user  # certification used as proxy
    # Pre-computed fit table
    assert "similarity 0.92" in user
    assert "covered" in user
    assert "GAP" in user
    # Schema instruction
    assert "JSON" in user


def test_hands_on_prompt_handles_employee_with_no_skills():
    emp = {**EMP, "skills": []}
    user = _build_hands_on_prompt(ROLE_CTX, CAPS, emp, FIT)[1]["content"]
    # The no-skills path should still render without error and surface the
    # employee's other context (years, certs) for the LLM to fall back on.
    assert "Uma Brown" in user
    assert "(no skills recorded)" in user


def test_auto_prompt_returns_system_then_user():
    top = [
        {"rank": 1, "employee": EMP, "match_score": 0.78, "fit_report": FIT},
    ]
    msgs = _build_auto_prompt(ROLE_CTX, CAPS, top)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


def test_auto_prompt_system_allows_override_but_defaults_to_rank1():
    sys_prompt = _build_auto_prompt(ROLE_CTX, CAPS, [{"rank": 1, "employee": EMP, "match_score": 0.5, "fit_report": FIT}])[0]["content"]
    assert "selecting the best-fit" in sys_prompt
    assert "override" in sys_prompt.lower()
    assert "rank-1" in sys_prompt or "rank 1" in sys_prompt


def test_auto_prompt_user_lists_each_candidate_with_id_and_score():
    emp2 = {**EMP, "id": "EMP002", "name": "Yasmin Johnson"}
    fit2 = [{**FIT[0], "similarity": 0.60}, FIT[1]]
    top = [
        {"rank": 1, "employee": EMP, "match_score": 0.78, "fit_report": FIT},
        {"rank": 2, "employee": emp2, "match_score": 0.71, "fit_report": fit2},
    ]
    user = _build_auto_prompt(ROLE_CTX, CAPS, top)[1]["content"]
    assert "Candidate rank 1: Uma Brown" in user
    assert "id: EMP001" in user
    assert "Candidate rank 2: Yasmin Johnson" in user
    assert "id: EMP002" in user
    assert "0.78" in user  # match score rendered
    assert "Worst gap:" in user
    assert "Strongest match:" in user


def test_auto_prompt_empty_candidates_renders_placeholder():
    user = _build_auto_prompt(ROLE_CTX, CAPS, [])[1]["content"]
    assert "(no candidates)" in user


# ── _condense_fit ─────────────────────────────────────────────────────────────


def test_condense_fit_returns_gap_and_covered_counts():
    c = _condense_fit(FIT)
    assert c["gap_count"] == 1
    assert c["covered_count"] == 1


def test_condense_fit_worst_gap_is_highest_similarity_times_weight():
    # FIT[1] is the gap: sim 0.31 * weight 3 = 0.93. FIT[0] is covered so not a gap.
    c = _condense_fit(FIT)
    assert c["worst_gap"]["capability"] == "API Design"
    assert c["worst_gap"]["similarity"] == 0.31


def test_condense_fit_strongest_match_is_highest_similarity_among_covered():
    c = _condense_fit(FIT)
    assert c["strongest_match"]["capability"] == "Cloud Architecture"
    assert c["strongest_match"]["similarity"] == 0.92


def test_condense_fit_all_gaps_returns_none_strongest():
    all_gaps = [{**FIT[1]}, {**FIT[1], "cap_name": "Other"}]
    c = _condense_fit(all_gaps)
    assert c["covered_count"] == 0
    assert c["strongest_match"] is None


def test_condense_fit_no_gaps_returns_none_worst():
    no_gaps = [{**FIT[0]}, {**FIT[0], "cap_name": "Other"}]
    c = _condense_fit(no_gaps)
    assert c["gap_count"] == 0
    assert c["worst_gap"] is None


# ── 2. Schema-validation tests ───────────────────────────────────────────────


def test_validate_hands_on_happy_path():
    out = _validate_hands_on_response(
        {"overall_fit_score": 82, "report": "Solid on cloud, gap on API."}
    )
    assert out == {"overall_fit_score": 82, "report": "Solid on cloud, gap on API."}


def test_validate_hands_on_rejects_string_score():
    with pytest.raises(LLMReportError, match="overall_fit_score"):
        _validate_hands_on_response({"overall_fit_score": "82", "report": "x"})


def test_validate_hands_on_rejects_bool_score():
    # bool is a subclass of int in Python; the validator must catch it.
    with pytest.raises(LLMReportError, match="overall_fit_score"):
        _validate_hands_on_response({"overall_fit_score": True, "report": "x"})


@pytest.mark.parametrize("bad_score", [-1, 101, 150])
def test_validate_hands_on_rejects_out_of_range_score(bad_score):
    with pytest.raises(LLMReportError, match="0"):
        _validate_hands_on_response({"overall_fit_score": bad_score, "report": "x"})


def test_validate_hands_on_rejects_empty_report():
    with pytest.raises(LLMReportError, match="report"):
        _validate_hands_on_response({"overall_fit_score": 50, "report": "   "})


def test_validate_hands_on_rejects_non_dict():
    with pytest.raises(LLMReportError, match="JSON object"):
        _validate_hands_on_response(["not", "a", "dict"])  # type: ignore[arg-type]


def test_validate_auto_happy_path():
    out = _validate_auto_response(
        {"selected_employee_id": "EMP001", "rationale": "Best on cloud."},
        ["EMP001", "EMP002"],
    )
    assert out["selected_employee_id"] == "EMP001"


def test_validate_auto_rejects_unknown_employee_id():
    with pytest.raises(LLMReportError, match="not among"):
        _validate_auto_response(
            {"selected_employee_id": "EMP999", "rationale": "x"},
            ["EMP001", "EMP002"],
        )


def test_validate_auto_rejects_empty_rationale():
    with pytest.raises(LLMReportError, match="rationale"):
        _validate_auto_response(
            {"selected_employee_id": "EMP001", "rationale": "  "}, ["EMP001"]
        )


def test_validate_auto_rejects_non_dict():
    with pytest.raises(LLMReportError, match="JSON object"):
        _validate_auto_response("not a dict", ["EMP001"])  # type: ignore[arg-type]


# ── Non-ASCII sanitisation ────────────────────────────────────────────────────


def test_sanitise_replaces_smart_quotes_and_hyphens():
    # Exact characters observed from Mercury 2 in the live test run.
    src = "The employee\u2019s end\u2011to\u2011end and en\u2013dash with \u201cquotes\u201d\u2026"
    out = _sanitise_text(src)
    assert out == "The employee's end-to-end and en-dash with \"quotes\"..."
    assert all(ord(c) < 128 for c in out), "non-ASCII characters remained"


def test_sanitise_strips_unrecognised_non_ascii():
    # Emoji and other non-ASCII should be dropped, not crash.
    src = "Gap in cloud \U0001f680 architecture"
    out = _sanitise_text(src)
    assert out == "Gap in cloud  architecture"  # emoji removed, rest intact
    assert all(ord(c) < 128 for c in out)


def test_sanitise_passes_through_plain_ascii():
    assert _sanitise_text("Plain ASCII only, 100%.") == "Plain ASCII only, 100%."


def test_sanitise_empty_string():
    assert _sanitise_text("") == ""


def test_validate_hands_on_sanitises_report():
    v = _validate_hands_on_response(
        {"overall_fit_score": 50, "report": "It\u2019s a gap\u2014significant."}
    )
    assert v["report"] == "It's a gap-significant."


def test_validate_auto_sanitises_rationale():
    v = _validate_auto_response(
        {"selected_employee_id": "E1", "rationale": "Best\u2010fit pick\u2026"}, ["E1"]
    )
    assert v["rationale"] == "Best-fit pick..."


# ── 3. Real-API integration test (gated on OPENROUTER_API_KEY) ───────────────


# Load .env explicitly so these tests are self-contained — test_llm_report.py
# imports core.llm_report directly (not app.py), so load_dotenv() is never
# called as a side effect of import. This makes the key available regardless
# of test ordering.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional for the non-integration tests


# The skip check runs at test collection/execution time, NOT at module import
# time, because other test modules (test_app.py) mutate os.environ in their
# fixtures. The deferred lambda form below sees the real environment state
# for this test run.
_HAS_KEY_MARKER = pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY", "").strip(),
    reason="OPENROUTER_API_KEY not set",
)


@_HAS_KEY_MARKER
def test_integration_generate_fit_report_against_real_api():
    import asyncio
    out = asyncio.run(generate_fit_report(ROLE_CTX, CAPS, EMP, FIT))
    assert isinstance(out, dict)
    assert isinstance(out["overall_fit_score"], int)
    assert 0 <= out["overall_fit_score"] <= 100
    assert isinstance(out["report"], str) and out["report"].strip()
    # Sanitisation must have run even on real API output.
    assert all(ord(c) < 128 for c in out["report"])


@_HAS_KEY_MARKER
def test_integration_select_best_candidate_against_real_api():
    import asyncio
    top = [
        {"rank": 1, "employee": EMP, "match_score": 0.78, "fit_report": FIT},
        {
            "rank": 2,
            "employee": {**EMP, "id": "EMP002", "name": "Yasmin Johnson"},
            "match_score": 0.71,
            "fit_report": [{**FIT[0], "similarity": 0.60}, FIT[1]],
        },
    ]
    out = asyncio.run(select_best_candidate(ROLE_CTX, CAPS, top))
    assert out["selected_employee_id"] in {"EMP001", "EMP002"}
    assert isinstance(out["rationale"], str) and out["rationale"].strip()
    assert all(ord(c) < 128 for c in out["rationale"])
