"""
Tests for the Sprint 2 LLM endpoints in app.py.

The LLM is stubbed throughout so these tests run with no OPENROUTER_API_KEY.
They cover:
  - The deterministic pipeline still returns 200 when the LLM is unavailable
    (US-S2-06: an LLM outage never breaks the core workflow).
  - /llm-report returns 503 with a clear message when no key is set.
  - /llm-report returns 404 for unknown role or employee.
  - /llm-report returns 200 and the cached shape when the LLM is stubbed.
  - A second identical /llm-report call does NOT re-invoke the LLM (US-S2-07).
  - Capability mutation invalidates the cache (US-S2-07).

The real-API path is covered by the key-gated integration tests in
test_llm_report.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app as appmod
from core import llm_report as L

# ── Fixtures ──────────────────────────────────────────────────────────────────

ROLE = "ROLE001"  # Solution Architect (exists in data/project.json)
EMP = "EMP001"    # Uma Brown


@pytest.fixture()
def client(monkeypatch):
    """A TestClient with a clean LLM cache and no env key per test.

    Uses monkeypatch.delenv so the original environment is restored
    automatically after the test — this prevents test-ordering bugs where
    a later key-gated integration test sees the key as missing because an
    earlier test popped it from os.environ.
    """
    for k in ("OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "OPENROUTER_MODEL"):
        monkeypatch.delenv(k, raising=False)
    L._client = None  # reset the lazy singleton so it re-reads the (now empty) env
    appmod._llm_cache.clear()
    appmod._capability_state.clear()  # start from inferred capabilities
    monkeypatch.setitem(
        appmod.app.dependency_overrides,
        appmod.get_current_user,
        lambda: {
            "user_id": "test-manager",
            "username": "test-manager",
            "role": "project manager",
            "employee_id": None,
        },
    )
    return TestClient(appmod.app)


@pytest.fixture()
def stub_llm(monkeypatch):
    """Stub the LLM entry point imported by app.py."""
    calls = {"report": 0}

    async def stub_report(*a, **kw):
        calls["report"] += 1
        return {"overall_fit_score": 77, "report": "Stubbed objective report."}

    monkeypatch.setattr(appmod, "generate_fit_report", stub_report)
    return calls


def _find_non_colliding_esco_uri(client: TestClient) -> str:
    """Return an ESCO URI not already on ROLE's capability list."""
    existing = {c["cap_id"] for c in appmod._get_or_infer_capabilities(ROLE)}
    r = client.get("/esco/search", params={"q": "communication", "limit": 50})
    assert r.status_code == 200
    for s in r.json():
        if s["concept_uri"] not in existing:
            return s["concept_uri"]
    pytest.fail("Could not find a non-colliding ESCO URI for cache invalidation test.")


# ── US-S2-06: deterministic pipeline survives LLM outage ─────────────────────


def test_get_fit_still_200_when_no_key(client):
    """The existing US007 endpoint must work even with no LLM key configured."""
    r = client.get(f"/roles/{ROLE}/candidates/{EMP}/fit")
    assert r.status_code == 200
    fit = r.json()
    assert len(fit) > 0
    assert {"cap_id", "cap_name", "weight", "best_match_skill", "similarity", "is_gap"} <= set(fit[0].keys())


def test_get_candidates_still_200_when_no_key(client):
    r = client.get(f"/roles/{ROLE}/candidates")
    assert r.status_code == 200
    assert len(r.json()) > 0


# ── US-S2-06: 503 fallback when the LLM is unavailable ──────────────────────


def test_llm_report_503_when_no_key(client):
    r = client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert r.status_code == 503
    assert "OPENROUTER_API_KEY" in r.json()["detail"]


# ── 404 paths ────────────────────────────────────────────────────────────────


def test_llm_report_404_unknown_role(client):
    r = client.post("/roles/NOPE/candidates/EMP001/llm-report")
    assert r.status_code == 404


def test_llm_report_404_unknown_employee(client):
    r = client.post(f"/roles/{ROLE}/candidates/NOPE/llm-report")
    assert r.status_code == 404


# ── US-S2-01/02: hands-on report happy path with stubbed LLM ────────────────


def test_llm_report_returns_prose_and_score(client, stub_llm):
    r = client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["employee_id"] == EMP
    assert body["overall_fit_score"] == 77
    assert isinstance(body["report"], str) and body["report"].strip()
    assert stub_llm["report"] == 1


# ── US-S2-07: cache hit does not re-invoke the LLM ──────────────────────────


def test_llm_report_cache_hit(client, stub_llm):
    r1 = client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    r2 = client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert r1.json() == r2.json()
    assert stub_llm["report"] == 1, "second call should not re-invoke the LLM"


# ── US-S2-07: capability mutation invalidates the cache ─────────────────────


def test_cache_invalidated_on_capability_add(client, stub_llm):
    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 1

    uri = _find_non_colliding_esco_uri(client)
    r = client.post(f"/roles/{ROLE}/capabilities", json={"esco_uri": uri, "weight": 3})
    assert r.status_code == 201

    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 2, "capability mutation should force a fresh LLM call"


def test_cache_invalidated_on_capability_delete(client, stub_llm):
    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 1

    caps = appmod._get_or_infer_capabilities(ROLE)
    cap_id_to_delete = caps[0]["cap_id"]
    r = client.delete(f"/roles/{ROLE}/capabilities/{cap_id_to_delete}")
    assert r.status_code == 200

    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 2


def test_cache_invalidated_on_capability_update(client, stub_llm):
    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 1

    caps = appmod._get_or_infer_capabilities(ROLE)
    cap_id = caps[0]["cap_id"]
    r = client.put(
        f"/roles/{ROLE}/capabilities/{cap_id}",
        json={"weight": 5},
    )
    assert r.status_code == 200

    client.post(f"/roles/{ROLE}/candidates/{EMP}/llm-report")
    assert stub_llm["report"] == 2
