"""
Tests for core.matching.

Covers:
  - All employees returned when no filters applied
  - Results sorted by match_score descending
  - Scores are in [0, 1]
  - Required fields present on every result dict
  - available_only filter excludes unavailable employees
  - require_prior_experience filter restricts by prior_roles title match
  - Combined filters return the intersection
  - Empty capability list produces zero scores for everyone
  - has_prior_experience flag is set correctly regardless of filter state
"""

from __future__ import annotations

import pytest

from core.matching import rank_candidates

_PM_TITLE = "Project Manager"

# Expected counts from the generated demo data (deterministic seed=42)
_TOTAL_EMPLOYEES = 30
_UNAVAILABLE_COUNT = 5          # one per archetype
_PM_PRIOR_EXP_COUNT = 3         # positions 0-2 of the PM archetype


# ── Basic shape ───────────────────────────────────────────────────────────────

def test_returns_all_employees_without_filters(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    assert len(results) == _TOTAL_EMPLOYEES


def test_results_not_empty(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    assert len(results) > 0


# ── Ordering and score range ───────────────────────────────────────────────────

def test_results_sorted_descending(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    scores = [r["match_score"] for r in results]
    assert scores == sorted(scores, reverse=True), "Results are not sorted by match_score descending"


def test_scores_in_range(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    for r in results:
        assert 0.0 <= r["match_score"] <= 1.0, (
            f"Score out of range for {r['name']}: {r['match_score']}"
        )


# ── Required fields ────────────────────────────────────────────────────────────

def test_result_has_required_fields(pm_caps, employees):
    required = {
        "employee_id", "name", "title", "role_level", "business_unit",
        "location", "match_score", "available", "has_prior_experience",
    }
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    for r in results:
        assert required <= r.keys(), f"Missing fields: {required - r.keys()}"


# ── available_only filter (US006) ──────────────────────────────────────────────

def test_available_only_excludes_unavailable(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, available_only=True, role_title=_PM_TITLE)
    assert all(r["available"] for r in results), "available_only=True returned an unavailable employee"


def test_available_only_reduces_count(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, available_only=True, role_title=_PM_TITLE)
    assert len(results) == _TOTAL_EMPLOYEES - _UNAVAILABLE_COUNT


def test_available_false_still_shown_without_filter(pm_caps, employees):
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    unavailable = [r for r in results if not r["available"]]
    assert len(unavailable) == _UNAVAILABLE_COUNT


# ── require_prior_experience filter (US005) ────────────────────────────────────

def test_prior_experience_filter_all_have_prior(pm_caps, employees):
    results = rank_candidates(
        pm_caps, employees, require_prior_experience=True, role_title=_PM_TITLE
    )
    assert all(r["has_prior_experience"] for r in results), (
        "require_prior_experience=True returned an employee without prior experience"
    )


def test_prior_experience_filter_correct_count(pm_caps, employees):
    results = rank_candidates(
        pm_caps, employees, require_prior_experience=True, role_title=_PM_TITLE
    )
    assert len(results) == _PM_PRIOR_EXP_COUNT


def test_has_prior_experience_flag_reflects_data(pm_caps, employees):
    """has_prior_experience should be True for exactly 3 PM candidates."""
    results = rank_candidates(pm_caps, employees, role_title=_PM_TITLE)
    with_prior = [r for r in results if r["has_prior_experience"]]
    assert len(with_prior) == _PM_PRIOR_EXP_COUNT


# ── Combined filters ───────────────────────────────────────────────────────────

def test_combined_filters_are_intersection(pm_caps, employees):
    results = rank_candidates(
        pm_caps, employees,
        require_prior_experience=True,
        available_only=True,
        role_title=_PM_TITLE,
    )
    for r in results:
        assert r["available"] and r["has_prior_experience"]


def test_combined_filters_count(pm_caps, employees):
    results = rank_candidates(
        pm_caps, employees,
        require_prior_experience=True,
        available_only=True,
        role_title=_PM_TITLE,
    )
    # PM archetype: unavailable position is pos2, which has prior experience.
    # So combined filter removes that 1 → 3 - 1 = 2.
    assert len(results) == _PM_PRIOR_EXP_COUNT - 1


# ── Edge cases ─────────────────────────────────────────────────────────────────

def test_empty_capabilities_gives_zero_scores(employees):
    results = rank_candidates([], employees, role_title=_PM_TITLE)
    assert all(r["match_score"] == 0.0 for r in results)


def test_empty_capabilities_still_returns_all_employees(employees):
    results = rank_candidates([], employees, role_title=_PM_TITLE)
    assert len(results) == _TOTAL_EMPLOYEES


def test_no_role_title_disables_prior_flag(pm_caps, employees):
    """Without a role_title, has_prior_experience should be False for everyone."""
    results = rank_candidates(pm_caps, employees, role_title="")
    assert all(not r["has_prior_experience"] for r in results)
