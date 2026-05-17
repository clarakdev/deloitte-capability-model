"""
FastAPI application — Deloitte PM Role-Capability Matching Backend.

Startup
-------
    uvicorn app:app --reload

Interactive API docs available at http://127.0.0.1:8000/docs

In-memory state
---------------
Capability lists are stored in `_capability_state` (role_id → list[dict]).
They are populated lazily on the first GET /roles/{id}/capabilities call by
running capability inference. All POST/PUT/DELETE mutations update this dict.
State is reset when the server restarts (by design for this sprint).

ESCO attribution (required)
----------------------------
"This service uses the ESCO classification of the European Commission."
The ESCO dataset has been filtered to cross-sector and transversal skills only.
Ref: Commission Decision 2011/833/EU.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.capability_inference import infer_capabilities
from core.embedding_engine import (
    embed_texts,
    get_esco_embeddings,
    get_esco_skills,
    get_uri_to_index,
)
from core.gap_analysis import analyse_fit
from core.matching import rank_candidates

# ── Data loading (at import time) ─────────────────────────────────────────────

_DATA_DIR = Path(__file__).resolve().parent / "data"


def _load_json(path: Path) -> object:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


_PROJECT: dict = _load_json(_DATA_DIR / "project.json")
_EMPLOYEES: list[dict] = _load_json(_DATA_DIR / "employees.json")
_EMP_BY_ID: dict[str, dict] = {e["id"]: e for e in _EMPLOYEES}
_ROLE_BY_ID: dict[str, dict] = {r["id"]: r for r in _PROJECT["roles"]}

# In-memory capability state: role_id → list of capability dicts
_capability_state: dict[str, list[dict]] = {}


# ── Startup warm-up ───────────────────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Pre-load the sentence-transformer model and ESCO embeddings on startup
    so the first API call is fast."""
    get_esco_embeddings()   # triggers model load + cache read
    yield


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Deloitte Capability Matching API",
    description=(
        "PM role-capability matching backend.\n\n"
        "**ESCO attribution**: This service uses the ESCO classification of the "
        "European Commission (filtered to cross-sector and transversal skills). "
        "Ref: Commission Decision 2011/833/EU."
    ),
    version="0.1.0",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────────

class RoleOut(BaseModel):
    id: str
    title: str
    description: str


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    roles: list[RoleOut]


class CapabilityOut(BaseModel):
    cap_id: str
    name: str
    esco_description: str
    weight: int
    is_inferred: bool


class AddCapabilityIn(BaseModel):
    esco_uri: str
    weight: int = Field(default=3, ge=1, le=5)


class UpdateCapabilityIn(BaseModel):
    weight: int | None = Field(default=None, ge=1, le=5)
    esco_uri: str | None = None  # provide to swap to a different ESCO skill


class CandidateOut(BaseModel):
    employee_id: str
    name: str
    title: str
    role_level: str
    business_unit: str
    location: str
    match_score: float
    available: bool
    has_prior_experience: bool


class FitItemOut(BaseModel):
    cap_id: str
    cap_name: str
    weight: int
    best_match_skill: str | None
    similarity: float
    is_gap: bool


class EscoSkillOut(BaseModel):
    concept_uri: str
    preferred_label: str
    alt_labels: str
    skill_type: str
    reuse_level: str
    description: str


# ── Internal helpers ───────────────────────────────────────────────────────────

def _require_role(role_id: str) -> dict:
    role = _ROLE_BY_ID.get(role_id)
    if role is None:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found.")
    return role


def _get_or_infer_capabilities(role_id: str) -> list[dict]:
    """Return capabilities for a role, inferring them on first access."""
    if role_id not in _capability_state:
        role = _require_role(role_id)
        _capability_state[role_id] = infer_capabilities(role["title"], role["description"])
    return _capability_state[role_id]


def _cap_to_out(cap: dict) -> CapabilityOut:
    return CapabilityOut(
        cap_id=cap["cap_id"],
        name=cap["name"],
        esco_description=cap.get("esco_description", ""),
        weight=cap.get("weight", 3),
        is_inferred=cap.get("is_inferred", False),
    )


def _esco_skill_to_out(s: dict) -> EscoSkillOut:
    return EscoSkillOut(
        concept_uri=s["conceptUri"],
        preferred_label=s["preferredLabel"],
        alt_labels=s.get("altLabels", ""),
        skill_type=s.get("skillType", ""),
        reuse_level=s.get("reuseLevel", ""),
        description=s.get("description", ""),
    )


# ── Project ────────────────────────────────────────────────────────────────────

@app.get(
    "/project",
    response_model=ProjectOut,
    tags=["Project"],
    summary="Get the demo project and its roles",
)
def get_project():
    """Return the pre-defined demo project (US001)."""
    return _PROJECT


# ── Capabilities ───────────────────────────────────────────────────────────────

@app.get(
    "/roles/{role_id}/capabilities",
    response_model=list[CapabilityOut],
    tags=["Capabilities"],
    summary="Get (or infer) capabilities for a role",
)
def get_capabilities(role_id: str):
    """
    Return the capability list for a role.

    On first call, capabilities are automatically inferred from the role
    description (US001, US002). Subsequent calls return the current edited list.
    """
    _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)
    return [_cap_to_out(c) for c in caps]


@app.post(
    "/roles/{role_id}/capabilities",
    response_model=list[CapabilityOut],
    status_code=201,
    tags=["Capabilities"],
    summary="Add an ESCO skill as a capability",
)
def add_capability(role_id: str, body: AddCapabilityIn):
    """
    Add an ESCO skill to a role's capability list (US003).

    Supply the ESCO `conceptUri` (from `GET /esco/search`) and an optional
    importance weight (1–5, default 3).
    """
    _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    uri_to_index = get_uri_to_index()
    skill_idx = uri_to_index.get(body.esco_uri)
    if skill_idx is None:
        raise HTTPException(
            status_code=422,
            detail=f"ESCO URI not found in curated skill set: '{body.esco_uri}'",
        )

    if any(c["cap_id"] == body.esco_uri for c in caps):
        raise HTTPException(
            status_code=409,
            detail="This ESCO skill is already in the capability list.",
        )

    skills = get_esco_skills()
    esco_embs = get_esco_embeddings()
    skill = skills[skill_idx]

    caps.append({
        "cap_id":           skill["conceptUri"],
        "name":             skill["preferredLabel"],
        "esco_description": skill.get("description", ""),
        "embedding":        esco_embs[skill_idx].copy(),
        "weight":           body.weight,
        "is_inferred":      False,
    })
    return [_cap_to_out(c) for c in caps]


@app.put(
    "/roles/{role_id}/capabilities/{cap_id:path}",
    response_model=list[CapabilityOut],
    tags=["Capabilities"],
    summary="Update a capability's weight or swap its ESCO skill",
)
def update_capability(role_id: str, cap_id: str, body: UpdateCapabilityIn):
    """
    Update a capability on a role (US003, US004).

    - Provide `weight` (1–5) to change importance.
    - Provide `esco_uri` to swap the capability for a different ESCO skill
      (retains the current weight unless `weight` is also supplied).
    - Both fields are optional; at least one must be non-null.

    `cap_id` in the URL is the ESCO `conceptUri` (URL-encoded).
    """
    _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    if body.weight is None and body.esco_uri is None:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of 'weight' or 'esco_uri'.",
        )

    cap_idx = next((i for i, c in enumerate(caps) if c["cap_id"] == cap_id), None)
    if cap_idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Capability '{cap_id}' not found on role '{role_id}'.",
        )

    cap = caps[cap_idx]

    if body.weight is not None:
        cap["weight"] = body.weight

    if body.esco_uri is not None and body.esco_uri != cap_id:
        uri_to_index = get_uri_to_index()
        skill_idx = uri_to_index.get(body.esco_uri)
        if skill_idx is None:
            raise HTTPException(
                status_code=422,
                detail=f"ESCO URI not found in curated skill set: '{body.esco_uri}'",
            )
        if any(c["cap_id"] == body.esco_uri for c in caps):
            raise HTTPException(
                status_code=409,
                detail="This ESCO skill is already in the capability list.",
            )
        skills = get_esco_skills()
        esco_embs = get_esco_embeddings()
        skill = skills[skill_idx]
        cap["cap_id"]           = skill["conceptUri"]
        cap["name"]             = skill["preferredLabel"]
        cap["esco_description"] = skill.get("description", "")
        cap["embedding"]        = esco_embs[skill_idx].copy()
        cap["is_inferred"]      = False

    return [_cap_to_out(c) for c in caps]


@app.delete(
    "/roles/{role_id}/capabilities/{cap_id:path}",
    response_model=list[CapabilityOut],
    tags=["Capabilities"],
    summary="Remove a capability from a role",
)
def delete_capability(role_id: str, cap_id: str):
    """
    Remove a capability from a role's list (US003).

    `cap_id` in the URL is the ESCO `conceptUri` (URL-encoded).
    """
    _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    new_caps = [c for c in caps if c["cap_id"] != cap_id]
    if len(new_caps) == len(caps):
        raise HTTPException(
            status_code=404,
            detail=f"Capability '{cap_id}' not found on role '{role_id}'.",
        )
    _capability_state[role_id] = new_caps
    return [_cap_to_out(c) for c in new_caps]


# ── ESCO search ────────────────────────────────────────────────────────────────

@app.get(
    "/esco/search",
    response_model=list[EscoSkillOut],
    tags=["ESCO"],
    summary="Search ESCO skills by label",
)
def search_esco(
    q: Annotated[str, Query(min_length=2, description="Search term")],
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Search the curated ESCO skill set (US003 — choosing a skill to add).

    Matches against `preferredLabel` first, then `altLabels`.
    Falls back to semantic (embedding) search if fewer than 5 text matches
    are found.
    """
    skills = get_esco_skills()
    q_lower = q.lower()

    # 1. Preferred-label substring match
    label_matches = [s for s in skills if q_lower in s["preferredLabel"].lower()]

    # 2. Alt-label substring match (for any slots not already filled)
    if len(label_matches) < limit:
        label_uris = {s["conceptUri"] for s in label_matches}
        alt_matches = [
            s for s in skills
            if s["conceptUri"] not in label_uris
            and q_lower in s.get("altLabels", "").lower()
        ]
        combined = label_matches + alt_matches
    else:
        combined = label_matches

    # 3. Semantic fallback when text search returns very few results
    if len(combined) < 5:
        esco_embs = get_esco_embeddings()
        q_emb = embed_texts([q])[0]
        sims = esco_embs @ q_emb
        existing_uris = {s["conceptUri"] for s in combined}
        top_indices = np.argsort(sims)[::-1]
        semantic = [
            skills[i] for i in top_indices
            if skills[i]["conceptUri"] not in existing_uris
        ][: limit - len(combined)]
        combined = combined + semantic

    return [_esco_skill_to_out(s) for s in combined[:limit]]


# ── Matching ───────────────────────────────────────────────────────────────────

@app.get(
    "/roles/{role_id}/candidates",
    response_model=list[CandidateOut],
    tags=["Matching"],
    summary="Rank employees by fit to a role",
)
def get_candidates(
    role_id: str,
    require_prior_experience: bool = Query(
        default=False,
        description="Only return employees whose prior_roles includes the role title (US005)",
    ),
    available_only: bool = Query(
        default=False,
        description="Only return employees marked as available (US006)",
    ),
):
    """
    Return all employees ranked by semantic fit to the role (US005, US006).

    Uses the role's current capability list (auto-inferred on first call).
    """
    role = _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)
    results = rank_candidates(
        caps,
        _EMPLOYEES,
        require_prior_experience=require_prior_experience,
        available_only=available_only,
        role_title=role["title"],
    )
    return results


@app.get(
    "/roles/{role_id}/candidates/{emp_id}/fit",
    response_model=list[FitItemOut],
    tags=["Matching"],
    summary="Per-capability fit breakdown for a candidate",
)
def get_candidate_fit(role_id: str, emp_id: str):
    """
    Return a per-capability fit breakdown for a specific employee (US007).

    For each required capability, shows the employee's closest matching DPN
    skill, the cosine similarity, and whether it is flagged as a gap
    (similarity < 0.6).
    """
    _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    employee = _EMP_BY_ID.get(emp_id)
    if employee is None:
        raise HTTPException(status_code=404, detail=f"Employee '{emp_id}' not found.")

    return analyse_fit(caps, employee)
