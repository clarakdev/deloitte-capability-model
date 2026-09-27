"""
Regression tests for capability-state handling (bug: gap analysis described the
original auto-inferred capabilities instead of the PM's edited set).

Root cause was POST /infer/{role_id}/capabilities discarding any capability
list whose length differed from `top_k`, so the re-infer call made when entering
Frame 4 wiped the edits made in Frame 2.

Covered here:
  - Repeated /infer calls return the stored list unchanged (edits survive).
  - `force` regenerates suggestions on demand.
  - POST /roles/{id}/capabilities/load restores a persisted list and the
    matching/gap-analysis endpoints then use exactly that list.
  - An empty load clears the list.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app as appmod

ROLE = "ROLE001"
EMP = "EMP001"


def _payload(title: str = "PM", description: str = "Manages projects.", top_k: int = 5, **extra):
    return {"title": title, "description": description, "top_k": top_k, **extra}


@pytest.fixture()
def client():
    """A TestClient with clean capability state and stubbed auth."""
    appmod._llm_cache.clear()
    appmod._capability_state.clear()

    # Override the auth dependency (keyed by the real function object) so the
    # authenticated /candidates/{emp}/fit endpoint is reachable in tests.
    appmod.app.dependency_overrides[appmod.get_current_user] = lambda: {
        "user_id": "test",
        "username": "test",
        "role": "admin",
    }
    yield TestClient(appmod.app)
    appmod.app.dependency_overrides.clear()
    appmod._capability_state.clear()
    appmod._llm_cache.clear()


# ── /infer caching: stored lists are authoritative ────────────────────────────


def test_infer_returns_requested_count_when_empty(client):
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=3))
    assert r.status_code == 200
    assert len(r.json()) == 3


def test_infer_keeps_user_edits(client):
    """The bug fix: edits that change the list length must survive a re-infer."""
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    original = r.json()
    assert len(original) == 5

    removed_id = original[0]["cap_id"]
    r = client.delete(f"/roles/{ROLE}/capabilities/{removed_id}")
    assert r.status_code == 200
    edited = r.json()
    assert len(edited) == 4

    # Simulates Frame 4's "make sure capabilities are loaded" call.
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    assert r.status_code == 200
    after = r.json()
    assert [c["cap_id"] for c in after] == [c["cap_id"] for c in edited]
    assert removed_id not in {c["cap_id"] for c in after}


def test_infer_keeps_manual_additions(client):
    client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    skills = client.get("/esco/search", params={"q": "creative thinking", "limit": 50}).json()
    assert skills, "expected at least one ESCO search result"
    uri = skills[0]["concept_uri"]

    r = client.post(f"/roles/{ROLE}/capabilities", json={"esco_uri": uri, "weight": 3})
    assert r.status_code == 201
    edited = r.json()
    assert len(edited) == 6

    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    after = r.json()
    assert [c["cap_id"] for c in after] == [c["cap_id"] for c in edited]


def test_infer_force_regenerates(client):
    client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    caps = appmod._get_or_infer_capabilities(ROLE)
    client.delete(f"/roles/{ROLE}/capabilities/{caps[0]['cap_id']}")

    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5, force=True))
    assert r.status_code == 200
    assert len(r.json()) == 5
    assert all(c["is_inferred"] for c in r.json())


def test_infer_with_other_top_k_returns_stored_list(client):
    """top_k is a count for fresh inference only, not a cache-invalidation key."""
    client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=3))
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    assert len(r.json()) == 3


# ── /capabilities/load restores a persisted list ─────────────────────────────


def test_load_capabilities_restores_saved_list(client):
    # Persisted capabilities always come from the curated ESCO set, so build
    # the "saved" rows from real inferred skills.
    inferred = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5)).json()
    saved = [
        {
            "cap_id": inferred[0]["cap_id"],
            "name": inferred[0]["name"],
            "esco_description": inferred[0]["esco_description"],
            "weight": 5,
            "is_inferred": False,
        },
        {
            "cap_id": inferred[1]["cap_id"],
            "name": inferred[1]["name"],
            "esco_description": inferred[1]["esco_description"],
            "weight": 2,
            "is_inferred": True,
        },
    ]
    r = client.post(f"/roles/{ROLE}/capabilities/load", json={"capabilities": saved})
    assert r.status_code == 200
    loaded = r.json()
    assert [c["cap_id"] for c in loaded] == [s["cap_id"] for s in saved]
    assert [c["weight"] for c in loaded] == [5, 2]
    assert loaded[0]["is_inferred"] is False

    # The loaded list is authoritative for every later call.
    r = client.get(f"/roles/{ROLE}/capabilities")
    assert [c["cap_id"] for c in r.json()] == [s["cap_id"] for s in saved]
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    assert [c["cap_id"] for c in r.json()] == [s["cap_id"] for s in saved]


def test_load_capabilities_hydrates_embeddings_for_gap_analysis(client):
    """Loaded capabilities must be usable by analyse_fit (needs embeddings)."""
    r = client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    inferred = r.json()
    saved = [
        {
            "cap_id": cap["cap_id"],
            "name": cap["name"],
            "esco_description": cap["esco_description"],
            "weight": 4,
            "is_inferred": False,
        }
        for cap in inferred[:2]
    ]
    r = client.post(f"/roles/{ROLE}/capabilities/load", json={"capabilities": saved})
    assert r.status_code == 200

    fit = client.get(f"/roles/{ROLE}/candidates/{EMP}/fit").json()
    assert [f["cap_id"] for f in fit] == [s["cap_id"] for s in saved]
    assert all(f["weight"] == 4 for f in fit)


def test_load_capabilities_with_unknown_esco_uri_rejected(client):
    r = client.post(
        f"/roles/{ROLE}/capabilities/load",
        json={"capabilities": [{"cap_id": "not-a-real-uri", "name": "X", "weight": 3}]},
    )
    assert r.status_code == 422


def test_load_capabilities_empty_clears_list(client):
    client.post(f"/infer/{ROLE}/capabilities", json=_payload(top_k=5))
    r = client.post(f"/roles/{ROLE}/capabilities/load", json={"capabilities": []})
    assert r.status_code == 200
    assert r.json() == []
    assert appmod._get_or_infer_capabilities(ROLE) == []
