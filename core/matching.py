"""
Matching engine: ranks employees against a role's capability list.

Public API
----------
rank_candidates(
    role_capabilities,
    employees,
    require_prior_experience=False,
    available_only=False,
    role_title="",
) → list[dict]

Role vector
-----------
A weighted sum of the role's capability embeddings, where each capability's
weight is the PM-assigned importance (1–5). The result is L2-normalised.

Employee vector
---------------
Built via employee_profile.build_employee_vector (composite of skills +
narrative text — see that module for details).

Match score
-----------
Cosine similarity between the role vector and the employee vector (both
L2-normalised, so it reduces to a dot product). Range: [-1, 1], clipped to [0, 1].

Filters (applied before scoring)
---------------------------------
available_only=True         → only employees where available == True
require_prior_experience=True → only employees whose prior_roles list contains
                                role_title (case-insensitive exact match)

Return format
-------------
Sorted list (highest match_score first) of:
    {
        "employee_id":          str,
        "name":                 str,
        "title":                str,
        "role_level":           str,
        "business_unit":        str,
        "location":             str,
        "match_score":          float,  # 0–1, 2 d.p.
        "available":            bool,
        "has_prior_experience": bool,
    }

Employees for whom build_employee_vector returns None are excluded from
results (they have no embeddable profile content).
"""

from __future__ import annotations

import numpy as np

from .employee_profile import build_employee_vector, has_prior_experience


def _build_role_vector(role_capabilities: list[dict]) -> np.ndarray | None:
    """
    Build the role vector as the importance-weighted mean of capability
    embeddings, L2-normalised. Returns None if the list is empty.
    """
    if not role_capabilities:
        return None

    weighted_sum = None
    total_weight = 0.0

    for cap in role_capabilities:
        emb = cap.get("embedding")
        weight = float(cap.get("weight", 1))
        if emb is None:
            continue
        emb = np.asarray(emb, dtype=np.float32)
        weighted_sum = emb * weight if weighted_sum is None else weighted_sum + emb * weight
        total_weight += weight

    if weighted_sum is None or total_weight == 0.0:
        return None

    vec = weighted_sum / total_weight
    norm = np.linalg.norm(vec)
    if norm == 0.0:
        return None
    return (vec / norm).astype(np.float32)


def rank_candidates(
    role_capabilities: list[dict],
    employees: list[dict],
    require_prior_experience: bool = False,
    available_only: bool = False,
    role_title: str = "",
) -> list[dict]:
    """
    Rank employees by semantic fit to the role.

    Parameters
    ----------
    role_capabilities :        List of capability dicts (from capability_inference
                               or app state — must contain "embedding" and "weight").
    employees :                List of DPN employee dicts.
    require_prior_experience : If True, only include employees whose prior_roles
                               contains role_title (case-insensitive).
    available_only :           If True, only include employees where available==True.
    role_title :               Used for the prior-experience check and the
                               has_prior_experience flag in results.

    Returns
    -------
    Sorted list of candidate result dicts (see module docstring).
    """
    role_vector = _build_role_vector(role_capabilities)

    results: list[dict] = []

    for emp in employees:
        # ── Availability filter ───────────────────────────────────────────
        if available_only and not emp.get("available", True):
            continue

        # ── Prior-experience filter ───────────────────────────────────────
        emp_has_prior = has_prior_experience(emp, role_title) if role_title else False
        if require_prior_experience and not emp_has_prior:
            continue

        # ── Build employee vector ─────────────────────────────────────────
        emp_vector = build_employee_vector(emp)
        if emp_vector is None:
            continue  # No embeddable content — skip

        # ── Score ─────────────────────────────────────────────────────────
        if role_vector is not None:
            score = float(np.dot(role_vector, emp_vector))
            score = max(0.0, min(1.0, score))  # clip to [0, 1]
        else:
            score = 0.0

        results.append({
            "employee_id":          emp["id"],
            "name":                 emp.get("name", ""),
            "title":                emp.get("title", ""),
            "role_level":           emp.get("role_level", ""),
            "business_unit":        emp.get("business_unit", ""),
            "location":             emp.get("location", ""),
            "match_score":          round(score, 4),
            "available":            emp.get("available", True),
            "has_prior_experience": emp_has_prior,
        })

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results
