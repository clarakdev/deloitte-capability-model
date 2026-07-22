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
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from core.capability_inference import infer_capabilities
from core.embedding_engine import (
    embed_texts,
    get_esco_embeddings,
    get_esco_skills,
    get_uri_to_index,
)
from core.gap_analysis import analyse_fit
from core.logger import log_security_event
from core.matching import rank_candidates
from core.security import ALGORITHM, SECRET_KEY, create_access_token, verify_password

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

# ── Authentication and RBAC ────────────────────────────────────────────────

# Store the user-account file path once so the authentication section can read
# the local users.json file without altering any route behavior.
_USERS_FILE = _DATA_DIR / "users.json"
# This in-memory lookup lets the API resolve a username to its stored password
# hash and role quickly during login attempts and protected endpoint checks.
_USERS_BY_USERNAME: dict[str, dict] = {}

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


def _load_users() -> None:
    # Load the local user inventory from disk and populate the in-memory lookup.
    # This keeps the dictionary available immediately when the module is imported,
    # so login and token validation can resolve users without repeated file reads.
    if not _USERS_FILE.exists():
        _USERS_BY_USERNAME.clear()
        return
    loaded_users: list[dict] = _load_json(_USERS_FILE)
    _USERS_BY_USERNAME.clear()
    for user in loaded_users:
        username = user.get("username")
        if isinstance(username, str) and username:
            _USERS_BY_USERNAME[username] = {
                "username": username,
                "password_hash": user.get("password_hash", ""),
                "role": user.get("role", "user"),
                "employee_id": user.get("employee_id"),
            }


# Load the users once at module import time so the authentication layer is ready
# before any request reaches the protected endpoints.
_load_users()


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    # Create a consistent 401 response for any failed token handling, whether the
    # issue is malformed input, invalid signature, missing claims, or a missing
    # user record in the local lookup.
    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid authentication credentials",
    )
    try:
        # Decode and validate the incoming JWT using python-jose. The token is
        # checked against the configured secret and algorithm before any claims are
        # accepted as trustworthy.
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Extract the identity and role claims from the payload. These are the
        # values that the application uses to establish the current user context.
        username: str | None = payload.get("sub")
        role: str | None = payload.get("role")
        if username is None or role is None:
            raise credentials_exception
    except JWTError as exc:
        # If the token is malformed, expired, or tampered with, python-jose raises
        # an exception that is converted into the same 401 response the client sees.
        raise credentials_exception from exc

    # Use the in-memory user dictionary to confirm the token subject still maps
    # to a known account that exists in the local authentication data store.
    user = _USERS_BY_USERNAME.get(username)
    if user is None:
        raise credentials_exception
    # Ensure that the role embedded in the token still matches the role assigned
    # to the verified user in the local registry.
    if str(user.get("role", "")).strip().lower() != str(role).strip().lower():
        raise credentials_exception
    return user


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
                username=current_user.get("username", "unknown"),
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
    # Resolve the supplied username in the preloaded lookup. If the account does
    # not exist, the request is rejected immediately and an audit event is logged.
    user = _USERS_BY_USERNAME.get(payload.username)
    if user is None:
        log_security_event(
            username=payload.username,
            role="unknown",
            action="login",
            status="FAILED",
            details="user_not_found",
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Verify the submitted password against the stored bcrypt hash. The secure
    # comparison is delegated to the password helper so the API never compares or
    # stores plain-text credentials directly.
    if not verify_password(payload.password, user.get("password_hash", "")):
        log_security_event(
            username=payload.username,
            role=user.get("role", "unknown"),
            action="login",
            status="FAILED",
            details="invalid_password",
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # A successful credential check triggers an audit log entry and a signed JWT
    # containing the verified identity and role claim for downstream protected
    # routes.
    log_security_event(
        username=payload.username,
        role=user.get("role", "unknown"),
        action="login",
        status="SUCCESS",
        details="jwt_issued",
    )
    token = create_access_token({"sub": payload.username, "role": user.get("role", "user")})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=payload.username,
        role=user.get("role", "user"),
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


