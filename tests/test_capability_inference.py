"""
Tests for core.capability_inference.

Covers:
  - Correct number of capabilities returned (default and custom top_k)
  - Required fields present on every capability dict
  - Default weight and is_inferred values
  - Embedding shape and unit-normalisation
  - ESCO URI format on cap_id
  - Different roles produce different top capabilities
"""

from __future__ import annotations

import numpy as np
import pytest

from core.capability_inference import DEFAULT_WEIGHT, TOP_K, infer_capabilities


# ── Count and structure ────────────────────────────────────────────────────────

def test_default_top_k_count(pm_caps):
    assert len(pm_caps) == TOP_K


def test_custom_top_k_returns_correct_count():
    caps = infer_capabilities("Data Engineer", "Builds and maintains data pipelines.", top_k=3)
    assert len(caps) == 3


def test_large_top_k_does_not_error():
    # top_k larger than any reasonable ESCO subset should just return what's available
    caps = infer_capabilities("PM", "Manages projects.", top_k=10)
    assert len(caps) == 10


def test_required_fields_present(pm_caps):
    required = {"cap_id", "name", "esco_description", "embedding", "weight", "is_inferred"}
    for cap in pm_caps:
        assert required <= cap.keys(), f"Missing keys in capability: {required - cap.keys()}"


# ── Default values ─────────────────────────────────────────────────────────────

def test_default_weight(pm_caps):
    for cap in pm_caps:
        assert cap["weight"] == DEFAULT_WEIGHT


def test_is_inferred_true(pm_caps):
    for cap in pm_caps:
        assert cap["is_inferred"] is True


# ── Embedding integrity ────────────────────────────────────────────────────────

def test_embedding_is_ndarray(pm_caps):
    for cap in pm_caps:
        assert isinstance(cap["embedding"], np.ndarray)


def test_embedding_is_1d(pm_caps):
    for cap in pm_caps:
        assert cap["embedding"].ndim == 1, "Expected 1-D embedding vector"


def test_embedding_is_unit_normalised(pm_caps):
    for cap in pm_caps:
        norm = float(np.linalg.norm(cap["embedding"]))
        assert abs(norm - 1.0) < 1e-4, f"Embedding not unit-normalised (norm={norm:.6f})"


def test_embedding_is_float32(pm_caps):
    for cap in pm_caps:
        assert cap["embedding"].dtype == np.float32


# ── ESCO URI format ────────────────────────────────────────────────────────────

def test_cap_id_is_esco_uri(pm_caps):
    for cap in pm_caps:
        assert cap["cap_id"].startswith("http://data.europa.eu/esco/"), (
            f"cap_id does not look like an ESCO URI: {cap['cap_id']}"
        )


def test_cap_ids_are_unique(pm_caps):
    ids = [cap["cap_id"] for cap in pm_caps]
    assert len(ids) == len(set(ids)), "Duplicate cap_ids in inferred capabilities"


# ── Semantic sanity ────────────────────────────────────────────────────────────

def test_different_roles_produce_different_top_capability(pm_caps, arch_caps):
    """Project Manager and Solution Architect should not share the same top skill."""
    assert pm_caps[0]["cap_id"] != arch_caps[0]["cap_id"], (
        "Expected different top capabilities for PM vs Solution Architect"
    )


def test_name_is_non_empty_string(pm_caps):
    for cap in pm_caps:
        assert isinstance(cap["name"], str)
        assert cap["name"].strip() != ""
