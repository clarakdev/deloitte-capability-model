"""
Shared pytest fixtures for the sprint 1 test suite.

All heavyweight fixtures (model load, embedding computation) are
session-scoped so they run once per `pytest` invocation regardless of
how many test modules import them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ── Data fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def employees() -> list[dict]:
    with open(_DATA_DIR / "employees.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="session")
def project() -> dict:
    with open(_DATA_DIR / "project.json", encoding="utf-8") as f:
        return json.load(f)


# ── Capability fixtures (inferred once per session) ────────────────────────────

@pytest.fixture(scope="session")
def pm_caps() -> list[dict]:
    """Top-5 inferred capabilities for the Project Manager role."""
    from core.capability_inference import infer_capabilities
    return infer_capabilities(
        "Project Manager",
        "Owns delivery of the full programme, managing scope, schedule, budget "
        "and stakeholder reporting. Facilitates sprint planning, escalates risks, "
        "and coordinates dependencies between technical and change workstreams.",
    )


@pytest.fixture(scope="session")
def arch_caps() -> list[dict]:
    """Top-5 inferred capabilities for the Solution Architect role."""
    from core.capability_inference import infer_capabilities
    return infer_capabilities(
        "Solution Architect",
        "Responsible for defining the end-to-end technical architecture, including "
        "cloud infrastructure design, integration patterns and API strategy.",
    )
