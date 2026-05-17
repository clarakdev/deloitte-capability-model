"""
Tests for core.gap_analysis.

Covers:
  - One entry returned per capability
  - Required fields present on every entry
  - Employee with no skills → all gaps, similarity 0.0, best_match_skill None
  - Similarity values are in [0, 1]
  - is_gap is consistent with the GAP_THRESHOLD constant
  - Using the exact capability label as an employee skill → not a gap
  - Empty capability list → empty result
  - weight in result matches the capability dict
"""

from __future__ import annotations

import numpy as np
import pytest

from core.gap_analysis import GAP_THRESHOLD, analyse_fit


# ── Count and structure ────────────────────────────────────────────────────────

def test_one_entry_per_capability(pm_caps):
    employee = {"skills": [{"name": "project management"}]}
    result = analyse_fit(pm_caps, employee)
    assert len(result) == len(pm_caps)


def test_empty_capabilities_returns_empty_list(pm_caps):
    employee = {"skills": [{"name": "project management"}]}
    result = analyse_fit([], employee)
    assert result == []


def test_required_fields_present(pm_caps):
    employee = {"skills": [{"name": "project management"}]}
    result = analyse_fit(pm_caps, employee)
    required = {"cap_id", "cap_name", "weight", "best_match_skill", "similarity", "is_gap"}
    for item in result:
        assert required <= item.keys(), f"Missing keys: {required - item.keys()}"


# ── No-skills edge case ────────────────────────────────────────────────────────

def test_no_skills_all_gaps(pm_caps):
    employee = {"skills": []}
    result = analyse_fit(pm_caps, employee)
    assert all(item["is_gap"] for item in result)


def test_no_skills_zero_similarity(pm_caps):
    employee = {"skills": []}
    result = analyse_fit(pm_caps, employee)
    assert all(item["similarity"] == 0.0 for item in result)


def test_no_skills_best_match_is_none(pm_caps):
    employee = {"skills": []}
    result = analyse_fit(pm_caps, employee)
    assert all(item["best_match_skill"] is None for item in result)


# ── Similarity range ───────────────────────────────────────────────────────────

def test_similarity_in_range(pm_caps):
    employee = {"skills": [{"name": "Project Management"}, {"name": "Risk Management"}]}
    result = analyse_fit(pm_caps, employee)
    for item in result:
        assert 0.0 <= item["similarity"] <= 1.0, (
            f"Similarity out of range for '{item['cap_name']}': {item['similarity']}"
        )


# ── Gap threshold consistency ──────────────────────────────────────────────────

def test_is_gap_consistent_with_threshold(pm_caps):
    employee = {"skills": [{"name": "Project Management"}, {"name": "Stakeholder Engagement"}]}
    result = analyse_fit(pm_caps, employee)
    for item in result:
        expected_gap = item["similarity"] < GAP_THRESHOLD
        assert item["is_gap"] == expected_gap, (
            f"is_gap={item['is_gap']} inconsistent with similarity={item['similarity']:.4f} "
            f"and threshold={GAP_THRESHOLD}"
        )


# ── Semantic sanity ────────────────────────────────────────────────────────────

def test_exact_capability_label_not_a_gap(pm_caps):
    """
    Giving the employee a skill whose name is the exact ESCO preferred label of
    a capability should yield near-perfect similarity and therefore not a gap.
    """
    cap = pm_caps[0]
    employee = {"skills": [{"name": cap["name"]}]}
    result = analyse_fit([cap], employee)
    item = result[0]
    assert not item["is_gap"], (
        f"Exact label '{cap['name']}' should not be a gap (similarity={item['similarity']:.4f})"
    )
    # Capability embeddings are computed from "label. description" (full text),
    # while skill embeddings use the skill name only. Expect a solid but not
    # perfect match — well above the gap threshold of 0.6.
    assert item["similarity"] > 0.7, (
        f"Expected similarity > 0.7 for exact label match, got {item['similarity']:.4f}"
    )


def test_best_match_skill_is_string_when_skills_present(pm_caps):
    employee = {"skills": [{"name": "Project Management"}]}
    result = analyse_fit(pm_caps, employee)
    for item in result:
        assert isinstance(item["best_match_skill"], str)
        assert item["best_match_skill"].strip() != ""


# ── Weight passthrough ─────────────────────────────────────────────────────────

def test_weight_matches_capability(pm_caps):
    employee = {"skills": [{"name": "Project Management"}]}
    result = analyse_fit(pm_caps, employee)
    for cap, item in zip(pm_caps, result):
        assert item["weight"] == cap["weight"]


def test_weight_reflects_custom_value():
    """Capabilities with non-default weights should have that weight in the result."""
    from core.embedding_engine import get_esco_embeddings, get_esco_skills
    skills = get_esco_skills()
    embs = get_esco_embeddings()
    custom_cap = {
        "cap_id":           skills[0]["conceptUri"],
        "name":             skills[0]["preferredLabel"],
        "esco_description": skills[0].get("description", ""),
        "embedding":        embs[0].copy(),
        "weight":           5,
        "is_inferred":      False,
    }
    employee = {"skills": [{"name": "Project Management"}]}
    result = analyse_fit([custom_cap], employee)
    assert result[0]["weight"] == 5


# ── cap_id passthrough ────────────────────────────────────────────────────────

def test_cap_id_matches_capability(pm_caps):
    employee = {"skills": [{"name": "Project Management"}]}
    result = analyse_fit(pm_caps, employee)
    for cap, item in zip(pm_caps, result):
        assert item["cap_id"] == cap["cap_id"]
