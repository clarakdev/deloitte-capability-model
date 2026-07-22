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

import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import numpy as np
from dotenv import load_dotenv
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
from core.llm_report import (
    ConfigError as LLMConfigError,
    LLMReportError,
    generate_fit_report,
    select_best_candidate,
)
from core.matching import rank_candidates

# Load .env (OPENROUTER_API_KEY / OPENROUTER_BASE_URL / OPENROUTER_MODEL) at
# import time so the LLM client picks up config without manual env exports.
load_dotenv()

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

# In-memory LLM cache, invalidated whenever a role's capabilities change.
# Keys: ("report", role_id, emp_id, capability_hash) for hands-on reports,
#       ("auto",   role_id, capability_hash)              for auto-selection.
# capability_hash is a stable digest of the role's capability ids+weights.
_llm_cache: dict[tuple, dict] = {}


def _capability_hash(caps: list[dict]) -> str:
    """Stable digest of a role's capability ids + weights (order-independent)."""
    pairs = sorted(
        (str(c.get("cap_id", "")), int(c.get("weight", 1))) for c in caps
    )
    raw = json.dumps(pairs, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def _invalidate_llm_cache(role_id: str) -> None:
    """Drop all cached LLM results for a role (called on capability mutation)."""
    keys_to_drop = [k for k in _llm_cache if k[1] == role_id]
    for k in keys_to_drop:
        _llm_cache.pop(k, None)


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


class LLMReportOut(BaseModel):
    employee_id: str
    overall_fit_score: int  # 0–100
    report: str


class AutoSelectOut(BaseModel):
    role_id: str
    selected_employee_id: str
    rationale: str
    all_top_candidates: list[dict]  # [{employee_id, name, match_score}, ...]


# ── Internal helpers ───────────────────────────────────────────────────────────

def _require_role(role_id: str) -> dict:
    role = _ROLE_BY_ID.get(role_id)
    if role is None:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found.")
    return role

def _require_capabilities_exist(role_id: str) -> None:
    """
    Ensures a capability list exists for this role.
    Works for both hardcoded role IDs (ROLE001 etc) and Supabase UUIDs.
    For Supabase roles, capabilities must have been inferred first via
    POST /roles/{id}/capabilities/infer before this is called.
    """
    if role_id not in _capability_state and role_id not in _ROLE_BY_ID:
        raise HTTPException(
            status_code=404,
            detail=f"No capabilities found for role '{role_id}'. Call /capabilities/infer first."
        )

def _get_or_infer_capabilities(role_id: str) -> list[dict]:
    """Return capabilities for a role, inferring them on first access."""
    if role_id not in _capability_state:
        # Try hardcoded roles first, otherwise raise
        role = _ROLE_BY_ID.get(role_id)
        if role is None:
            raise HTTPException(
                status_code=404,
                detail=f"Role '{role_id}' not found. For Supabase roles, call /capabilities/infer first."
            )
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

class InferCapabilitiesIn(BaseModel):
    title: str
    description: str


@app.post(
    "/infer/{role_id}/capabilities",
    response_model=list[CapabilityOut],
    tags=["Capabilities"],
    summary="Infer capabilities from a role title and description",
)
def infer_capabilities_from_description(role_id: str, body: InferCapabilitiesIn):
    """
    Infer capabilities for any role using its title and description.
    Used for roles coming from Supabase that are not in project.json.
    On subsequent calls returns the cached capability list if it exists.
    """
    if role_id not in _capability_state:
        _capability_state[role_id] = infer_capabilities(body.title, body.description)
    return [_cap_to_out(c) for c in _capability_state[role_id]]


@app.get(
    "/roles/{role_id}/capabilities",
    response_model=list[CapabilityOut],
    tags=["Capabilities"],
    summary="Get (or infer) capabilities for a role",
)
def get_capabilities(role_id: str):
    """
    Return the capability list for a role.
    Works for both hardcoded roles (ROLE001 etc) and Supabase UUIDs.
    For Supabase roles, call /infer/{role_id}/capabilities first.
    """
    _require_capabilities_exist(role_id)
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
    Supply the ESCO conceptUri (from GET /esco/search) and an optional weight (1-5, default 3).
    """
    _require_capabilities_exist(role_id)
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
    _invalidate_llm_cache(role_id)
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
    _require_capabilities_exist(role_id)
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

    _invalidate_llm_cache(role_id)
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
    _require_capabilities_exist(role_id)
    caps = _get_or_infer_capabilities(role_id)

    new_caps = [c for c in caps if c["cap_id"] != cap_id]
    if len(new_caps) == len(caps):
        raise HTTPException(
            status_code=404,
            detail=f"Capability '{cap_id}' not found on role '{role_id}'.",
        )
    _capability_state[role_id] = new_caps
    _invalidate_llm_cache(role_id)
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
    
    _require_capabilities_exist(role_id)
    role = _ROLE_BY_ID.get(role_id)
    role_title = role["title"] if role else ""
    caps = _get_or_infer_capabilities(role_id)
    results = rank_candidates(
        caps,
        _EMPLOYEES,
        require_prior_experience=require_prior_experience,
        available_only=available_only,
        role_title=role_title,
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
    _require_capabilities_exist(role_id)
    caps = _get_or_infer_capabilities(role_id)

    employee = _EMP_BY_ID.get(emp_id)
    if employee is None:
        raise HTTPException(status_code=404, detail=f"Employee '{emp_id}' not found.")

    return analyse_fit(caps, employee)


# ── LLM gap analysis (Sprint 2) ────────────────────────────────────────────────

@app.post(
    "/roles/{role_id}/candidates/{emp_id}/llm-report",
    response_model=LLMReportOut,
    tags=["LLM"],
    summary="Generate an AI fit report for a candidate (hands-on mode)",
)
async def get_llm_fit_report(role_id: str, emp_id: str):
    """
    Generate an objective prose fit report + overall fit score (0–100) for
    a specific employee against the role (US-S2-01, US-S2-02).

    The LLM interprets the deterministic `analyse_fit()` output; it does not
    re-judge fit from raw text. Responses are cached per (role, employee,
    capability hash) and invalidated when the role's capabilities change
    (US-S2-07). Returns 503 if the LLM service is unavailable — the
    deterministic `GET .../fit` endpoint remains usable (US-S2-06).
    """
    role = _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    employee = _EMP_BY_ID.get(emp_id)
    if employee is None:
        raise HTTPException(status_code=404, detail=f"Employee '{emp_id}' not found.")

    cap_hash = _capability_hash(caps)
    cache_key = ("report", role_id, emp_id, cap_hash)
    cached = _llm_cache.get(cache_key)
    if cached is not None:
        return cached

    fit_report = analyse_fit(caps, employee)
    try:
        result = await generate_fit_report(
            role_context={"title": role["title"], "description": role["description"]},
            role_capabilities=caps,
            employee=employee,
            fit_report=fit_report,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM report unavailable: OPENROUTER_API_KEY is not set. "
                "Embedding-based analysis is still available at "
                f"/roles/{role_id}/candidates/{emp_id}/fit."
            ),
        ) from exc
    except LLMReportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM report unavailable at this time. "
                "Embedding-based analysis is still available at "
                f"/roles/{role_id}/candidates/{emp_id}/fit."
            ),
        ) from exc

    payload = LLMReportOut(
        employee_id=emp_id,
        overall_fit_score=result["overall_fit_score"],
        report=result["report"],
    )
    _llm_cache[cache_key] = payload
    return payload


@app.post(
    "/roles/{role_id}/auto-select",
    response_model=AutoSelectOut,
    tags=["LLM"],
    summary="Let the LLM pick the best candidate from the top 5 (auto mode)",
)
async def auto_select_candidate(role_id: str):
    """
    Use the LLM to select the best-fit candidate from the top 5 embedding
    results (US-S2-03). The LLM may override embedding rank #1; its choice is
    binding and a short rationale is returned alongside the other top
    candidates for transparency (US-S2-04).

    Cached per (role, capability hash) and invalidated on capability change
    (US-S2-07). Returns 503 if the LLM is unavailable; callers should fall
    back to embedding rank #1 in that case (US-S2-06).
    """
    role = _require_role(role_id)
    caps = _get_or_infer_capabilities(role_id)

    cap_hash = _capability_hash(caps)
    cache_key = ("auto", role_id, cap_hash)
    cached = _llm_cache.get(cache_key)
    if cached is not None:
        return cached

    ranked = rank_candidates(caps, _EMPLOYEES, role_title=role["title"])
    top = ranked[:5]
    if not top:
        raise HTTPException(
            status_code=422,
            detail="No ranked candidates available for this role.",
        )

    top_with_fit = []
    for i, cand in enumerate(top, start=1):
        emp = _EMP_BY_ID.get(cand["employee_id"])
        if emp is None:
            continue
        top_with_fit.append({
            "rank": i,
            "employee": emp,
            "match_score": cand["match_score"],
            "fit_report": analyse_fit(caps, emp),
        })

    if not top_with_fit:
        raise HTTPException(
            status_code=422,
            detail="No ranked candidates available for this role.",
        )

    try:
        result = await select_best_candidate(
            role_context={"title": role["title"], "description": role["description"]},
            role_capabilities=caps,
            top_candidates_with_fit=top_with_fit,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM auto-select unavailable: OPENROUTER_API_KEY is not set. "
                "Falling back to embedding rank #1 is recommended."
            ),
        ) from exc
    except LLMReportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM auto-select unavailable at this time. "
                "Falling back to embedding rank #1 is recommended."
            ),
        ) from exc

    payload = AutoSelectOut(
        role_id=role_id,
        selected_employee_id=result["selected_employee_id"],
        rationale=result["rationale"],
        all_top_candidates=[
            {"employee_id": c["employee_id"], "name": c["name"], "match_score": c["match_score"]}
            for c in top
        ],
    )
    _llm_cache[cache_key] = payload
    return payload
