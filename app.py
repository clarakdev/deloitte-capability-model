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
from io import BytesIO
from typing import Annotated

import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from datetime import datetime
import copy

from core.capability_inference import infer_capabilities
from core.employee_levels import is_valid_role_level
from core.embedding_engine import (
    embed_texts,
    get_esco_embeddings,
    get_esco_skills,
    get_uri_to_index,
)
from core.gap_analysis import analyse_fit
from core.logger import log_security_event
from core.llm_report import (
    ConfigError as LLMConfigError,
    LLMReportError,
    generate_fit_report,
    generate_team_summary,
    select_best_candidate,
)
from core.matching import rank_candidates
from core.security import (
    ALGORITHM,
    SECRET_KEY,
    decode_supabase_access_token,
    get_supabase_client,
    resolve_profile_from_user_id,
)

from core.team_report import build_team_report_docx

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
_invalid_role_levels = [
    (employee.get("id", "<unknown>"), employee.get("role_level"))
    for employee in _EMPLOYEES
    if not is_valid_role_level(employee.get("role_level"))
]
if _invalid_role_levels:
    invalid_summary = ", ".join(
        f"{emp_id}: {value!r}" for emp_id, value in _invalid_role_levels
    )
    raise ValueError(f"Invalid employee role_level values: {invalid_summary}")

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

class TeamReportCapabilityIn(BaseModel):
    cap_id: str
    name: str
    esco_description: str = ""
    weight: int = Field(default=3, ge=1, le=5)
    is_inferred: bool = False


class TeamReportAssignmentIn(BaseModel):
    employee_id: str
    employee_name: str = ""
    match_score: float


class TeamReportRoleIn(BaseModel):
    id: str
    title: str
    description: str = ""
    assignment: TeamReportAssignmentIn
    capabilities: list[TeamReportCapabilityIn]


class TeamReportIn(BaseModel):
    project_id: str
    project_name: str
    project_description: str = ""
    client: str | None = None
    roles: list[TeamReportRoleIn]

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
    
def _apply_availability(employees: list, project_start_date: str = None) -> list:
    """
    Returns a deep copy of employees with availability overridden
    based on project start date and unavailability periods.
    If no date provided, returns employees as-is.
    """
    import copy
    from datetime import datetime

    employees = copy.deepcopy(employees)
    if not project_start_date:
        return employees
    try:
        start = datetime.strptime(project_start_date, "%Y-%m-%d").date()
        for emp in employees:
            unavailability = emp.get("unavailability", [])
            is_unavailable = any(
                datetime.strptime(u["from"], "%Y-%m-%d").date() <= start <=
                datetime.strptime(u["to"], "%Y-%m-%d").date()
                for u in unavailability
            )
            if is_unavailable:
                emp["available"] = False
    except ValueError:
        pass
    return employees

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

def _hydrate_report_capabilities(
    capabilities: list[TeamReportCapabilityIn],
) -> list[dict]:
    """
    Convert saved Supabase capabilities into the full capability structure
    required by analyse_fit(), including ESCO embeddings.
    """
    uri_to_index = get_uri_to_index()
    esco_embeddings = get_esco_embeddings()

    hydrated: list[dict] = []

    for capability in capabilities:
        skill_index = uri_to_index.get(capability.cap_id)

        if skill_index is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Capability '{capability.name}' could not be matched "
                    f"to the ESCO embedding dataset."
                ),
            )

        hydrated.append({
            "cap_id": capability.cap_id,
            "name": capability.name,
            "esco_description": capability.esco_description,
            "weight": capability.weight,
            "is_inferred": capability.is_inferred,
            "embedding": esco_embeddings[skill_index].copy(),
        })

    return hydrated

# ── Authentication and RBAC ────────────────────────────────────────────────

# OAuth2PasswordBearer defines how FastAPI will expect the bearer token to be
# supplied in the Authorization header for protected endpoints.
# The tokenUrl="login" points the Swagger UI to the /login route.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


# Pydantic models in this section act as a validation and serialization contract.
# UserLogin ensures that the incoming login payload is shaped correctly and that
# required values like username and password are present before the route logic
# receives them. TokenData and TokenResponse define the expected structure for
# token-related payloads so callers receive a predictable, sanitized response.
class UserLogin(BaseModel):
    username: str
    password: str


class TokenData(BaseModel):
    username: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    # Create a consistent 401 response for any failed token handling, whether the
    # issue is malformed input, invalid signature, missing claims, or a missing
    # profile record in the Supabase lookup.
    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid authentication credentials",
    )
    try:
        response = decode_supabase_access_token(token)
        user_id = getattr(getattr(response, "user", None), "id", None)
        if user_id is None:
            raise credentials_exception
    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail="Supabase authentication configuration error",
        ) from exc
    except Exception as exc:
        raise credentials_exception from exc

    profile = resolve_profile_from_user_id(str(user_id))
    if profile is None:
        raise credentials_exception

    role = str(profile.get("role", "user") or "user").strip().lower()
    if not role:
        raise credentials_exception

    return {
        "user_id": str(user_id),
        "username": str(user_id),
        "role": role,
        "employee_id": profile.get("employee_id"),
        "first_name": profile.get("first_name"),
        "last_name": profile.get("last_name"),
    }


def require_roles(allowed_roles: list[str]):
    # This function is a dependency factory that returns a fresh async dependency
    # for each allowed-role list. It follows the factory pattern because the
    # outer function closes over the allowed_roles list and builds a role-specific
    # gate around the shared get_current_user dependency.
    async def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        # FastAPI resolves the dependency graph automatically when the route is
        # called. The current_user dependency runs first, and if the user is valid,
        # this inner function evaluates the role membership rule. If the role is
        # not allowed, the request is rejected with 403 and a security log entry is
        # emitted for audit purposes.
        normalized_role = str(current_user.get("role", "")).strip().lower()
        normalized_allowed = {str(item).strip().lower() for item in allowed_roles}
        if normalized_role not in normalized_allowed:
            log_security_event(
                username=current_user.get("user_id") or current_user.get("username", "unknown"),
                role=current_user.get("role", "unknown"),
                action="access_denied",
                status="FAILED",
                details=f"required_roles={allowed_roles}",
            )
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user

    return dependency


@app.post(
    "/login",
    response_model=TokenResponse,
    tags=["Authentication"],
    summary="Authenticate a user and issue a JWT",
)
async def login(payload: UserLogin) -> TokenResponse:
    try:
        client = get_supabase_client()
        auth_response = client.auth.sign_in_with_password(
            {
                "email": payload.username,
                "password": payload.password,
            }
        )
    except Exception as exc:
        log_security_event(
            username=payload.username,
            role="unknown",
            action="login",
            status="FAILED",
            details="supabase_auth_failed",
        )
        raise HTTPException(status_code=401, detail="Invalid username or password") from exc

    session = getattr(auth_response, "session", None)
    access_token = None
    if session is not None:
        access_token = getattr(session, "access_token", None)
    if access_token is None and isinstance(auth_response, dict):
        access_token = auth_response.get("access_token")
    if access_token is None:
        raise HTTPException(status_code=401, detail="Authentication failed")

    auth_user = getattr(auth_response, "user", None)
    if isinstance(auth_user, dict):
        user_id = auth_user.get("id")
        username = auth_user.get("email", payload.username)
    else:
        user_id = getattr(auth_user, "id", None)
        username = getattr(auth_user, "email", None) or payload.username

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication failed")

    profile = resolve_profile_from_user_id(str(user_id))
    if profile is None:
        log_security_event(
            username=str(user_id),
            role="unknown",
            action="login",
            status="FAILED",
            details="profile_not_found",
        )
        raise HTTPException(status_code=401, detail="Authentication failed")

    role = str(profile.get("role", "user") or "user").strip()
    log_security_event(
        username=str(user_id),
        role=role,
        action="login",
        status="SUCCESS",
        details="supabase_auth",
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=username or payload.username,
        role=role,
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
    top_k: int = 5  # default 5, range 1-10


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
    cached = _capability_state.get(role_id)
    if cached is None or len(cached) != body.top_k:
        _capability_state[role_id] = infer_capabilities(
            body.title,
            body.description,
            top_k=max(1, min(10, body.top_k))
        )
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
    dependencies=[Depends(require_roles(["Admin", "HR User", "Project Manager"]))]
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
    project_start_date: str = Query(
        default=None,
        description="Project start date (YYYY-MM-DD). If provided, overrides employee availability based on unavailability periods (US023)",
    ),
):
    """
    Return all employees ranked by semantic fit to the role (US005, US006).

    Uses the role's current capability list (auto-inferred on first call).
    """
    
    _require_capabilities_exist(role_id)
    role = _ROLE_BY_ID.get(role_id)
    role_title = role["title"] if role is not None else ""
    caps = _get_or_infer_capabilities(role_id)

    # Deep copy employees so we don't mutate the global _EMPLOYEES list
    employees = copy.deepcopy(_EMPLOYEES)

    # US023 — override availability based on project start date
    if project_start_date:
        try:
            start = datetime.strptime(project_start_date, "%Y-%m-%d").date()
            for emp in employees:
                unavailability = emp.get("unavailability", [])
                is_unavailable = any(
                    datetime.strptime(u["from"], "%Y-%m-%d").date() <= start <=
                    datetime.strptime(u["to"], "%Y-%m-%d").date()
                    for u in unavailability
                )
                if is_unavailable:
                    emp["available"] = False
        except ValueError:
            pass  # if date parsing fails keep existing available flag
    employees = _apply_availability(_EMPLOYEES, project_start_date)
    results = rank_candidates(
        caps,
        employees,
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
    dependencies=[Depends(require_roles(["Admin", "HR User", "Project Manager", "Employee"]))]
)
def get_candidate_fit(role_id: str, emp_id: str, current_user: dict = Depends(get_current_user)):
    
    # If they are an Employee, block them if they try to look at someone else's
    # emp_id. The comparison is performed against the employee_id mapping stored
    # for that account so self-service access remains isolated to the user's own
    # profile while all other lookups are rejected with HTTP 403.
    current_role = str(current_user.get("role", "")).strip().lower()
    if current_role == "employee":
        user_emp_id = current_user.get("employee_id") or current_user.get("username")
        print(f"DEBUG emp_id={emp_id} current_user.employee_id={user_emp_id}")
        if str(user_emp_id) != str(emp_id):
            raise HTTPException(
                status_code=403,
                detail="Access Denied: Employees are only permitted to view their own fit analysis."
            )
    
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



# LLM gap analysis

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
    _require_capabilities_exist(role_id)
    caps = _get_or_infer_capabilities(role_id)
    
    role = _ROLE_BY_ID.get(role_id)
    role_context = {
        "title": role["title"] if role else "",
        "description": role["description"] if role else "",
    }
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
            role_context=role_context,
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
    "/projects/{project_id}/team-report",
    tags=["Reports"],
    summary="Generate a Word Team Capability Report",
    dependencies=[
        Depends(
            require_roles(
                ["Admin", "HR User", "Project Manager"]
            )
        )
    ],
)
async def generate_project_team_report(
    project_id: str,
    body: TeamReportIn,
):
    """
    Generate a project-level DOCX report after every role has an assignment.

    The report contains:
    - project overview
    - proposed team mapping
    - average team match
    - roles with capability gaps
    - AI-generated team assessment
    - individual employee profiles
    - per-role capability alignment
    - individual AI assignment rationales
    """

    if project_id != body.project_id:
        raise HTTPException(
            status_code=400,
            detail="Project id does not match request body.",
        )

    if not body.roles:
        raise HTTPException(
            status_code=422,
            detail="The project has no roles.",
        )

    team_entries: list[dict] = []

    for role in body.roles:
        employee = _EMP_BY_ID.get(
            role.assignment.employee_id
        )

        if employee is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Employee "
                    f"'{role.assignment.employee_id}' "
                    f"was not found."
                ),
            )

        if not role.capabilities:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Role '{role.title}' has no saved capabilities."
                ),
            )

        capabilities = _hydrate_report_capabilities(
            role.capabilities
        )

        fit_report = analyse_fit(
            capabilities,
            employee,
        )

        gap_count = sum(
            1
            for item in fit_report
            if item.get("is_gap")
        )

        covered_count = len(fit_report) - gap_count

        avg_similarity = (
            sum(
                float(item.get("similarity", 0.0))
                for item in fit_report
            )
            / len(fit_report)
            if fit_report
            else 0.0
        )

        # Same calculation used by Frame4's scoreOutOfFive().
        avg_fit = min(
            5,
            max(
                0,
                int(avg_similarity * 5 + 0.999999),
            ),
        )

        role_context = {
            "title": role.title,
            "description": role.description,
        }

        # Reuse the existing individual AI report mechanism.
        #
        # If this exact employee/capability combination has already had
        # an AI report generated, use the existing in-memory cache.
        cap_hash = _capability_hash(capabilities)

        individual_cache_key = (
            "report",
            role.id,
            employee["id"],
            cap_hash,
        )

        cached_rationale = _llm_cache.get(
            individual_cache_key
        )

        if cached_rationale is not None:
            rationale = cached_rationale.report
        else:
            try:
                individual_result = await generate_fit_report(
                    role_context=role_context,
                    role_capabilities=capabilities,
                    employee=employee,
                    fit_report=fit_report,
                )

                rationale = individual_result["report"]

                _llm_cache[
                    individual_cache_key
                ] = LLMReportOut(
                    employee_id=employee["id"],
                    overall_fit_score=individual_result[
                        "overall_fit_score"
                    ],
                    report=individual_result["report"],
                )

            except (
                LLMConfigError,
                LLMReportError,
            ):
                rationale = (
                    "AI-generated assignment rationale "
                    "was unavailable for this export."
                )

        team_entries.append({
            "role_id": role.id,
            "role_title": role.title,
            "role_description": role.description,
            "employee": employee,
            "match_score": float(
                role.assignment.match_score
            ),
            "fit_report": fit_report,
            "avg_fit": avg_fit,
            "covered_count": covered_count,
            "gap_count": gap_count,
            "rationale": rationale,
        })

    project_context = {
        "id": body.project_id,
        "name": body.project_name,
        "description": body.project_description,
        "client": body.client,
    }

    # New team-level AI assessment.
    try:
        team_result = await generate_team_summary(
            project_context=project_context,
            team_entries=team_entries,
        )

        team_summary = team_result["summary"]

    except (
        LLMConfigError,
        LLMReportError,
    ):
        team_summary = (
            "AI-generated team assessment was unavailable "
            "for this export."
        )

    report_buffer = build_team_report_docx(
        project=project_context,
        entries=team_entries,
        team_summary=team_summary,
    )

    safe_project_name = "".join(
        character
        if character.isalnum() or character in ("-", "_")
        else "-"
        for character in body.project_name.strip()
    )

    safe_project_name = "-".join(
        part
        for part in safe_project_name.split("-")
        if part
    )

    filename = (
        f"{safe_project_name or 'Project'}"
        f"-Team-Report.docx"
    )

    return StreamingResponse(
        report_buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"'
            )
        },
    )

@app.post(
    "/roles/{role_id}/auto-select",
    response_model=AutoSelectOut,
    tags=["LLM"],
    summary="Let the LLM pick the best candidate from the top 5 (auto mode)",
)
async def auto_select_candidate(
    role_id: str,
    project_start_date: str = Query(default=None),  # add this
    current_user: dict = Depends(get_current_user),
):
    print(f"DEBUG auto_select role_id={role_id} project_start_date={project_start_date}")
    employees = _apply_availability(_EMPLOYEES, project_start_date)
    emp_availability = {e["id"]: e.get("available", True) for e in employees}
    print(f"DEBUG Uma Brown available: {emp_availability.get('EMP001', 'NOT FOUND')}")
    """
    Use the LLM to select the best-fit candidate from the top 5 embedding
    results (US-S2-03). The LLM may override embedding rank #1; its choice is
    binding and a short rationale is returned alongside the other top
    candidates for transparency (US-S2-04).

    Cached per (role, capability hash) and invalidated on capability change
    (US-S2-07). Returns 503 if the LLM is unavailable; callers should fall
    back to embedding rank #1 in that case (US-S2-06).
    """
    _require_capabilities_exist(role_id)
    caps = _get_or_infer_capabilities(role_id)

    role = _ROLE_BY_ID.get(role_id)
    role_title = role["title"] if role else ""
    role_description = role["description"] if role else ""
    role_context = {"title": role_title, "description": role_description}
    
    cap_hash = _capability_hash(caps)
    cache_key = ("auto", role_id, cap_hash)
    cached = _llm_cache.get(cache_key)
    if cached is not None:
        return cached

    employees = _apply_availability(_EMPLOYEES, project_start_date)
    emp_availability = {e["id"]: e.get("available", True) for e in employees}
    ranked = rank_candidates(caps, employees, role_title=role_title)
    available_ranked = [c for c in ranked if emp_availability.get(c["employee_id"], True)]
    top = available_ranked[:5] if available_ranked else ranked[:5]
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
            role_context=role_context,
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

