"""
Gap analysis: for each assignment, compare the role's required SFIA skills
against the employee's skills to identify capability gaps.

For each required skill, the employee's closest matching skill is found via
cosine similarity. If the best match falls below GAP_THRESHOLD the skill is
flagged as a gap the employee should develop.
"""

from __future__ import annotations

import numpy as np

from .embedding_engine import get_skill_embeddings, get_skills

# Cosine similarity below this value is treated as a meaningful gap
GAP_THRESHOLD = 0.6

_code_to_index: dict[str, int] | None = None


def _get_code_to_index() -> dict[str, int]:
    global _code_to_index
    if _code_to_index is None:
        _code_to_index = {s["code"]: i for i, s in enumerate(get_skills())}
    return _code_to_index


def analyse_gaps(assignment: dict) -> list[dict]:
    """
    Analyse capability gaps for a single assignment.

    Parameters
    ----------
    assignment : dict
        An assignment dict as returned by matching.assign().

    Returns
    -------
    list of dicts, one per required skill, each containing:
        required_code     (str)
        required_name     (str)
        required_category (str)
        best_match_code   (str | None)
        best_match_name   (str | None)
        best_match_level  (int | None)   — employee's proficiency level
        similarity        (float)         — cosine similarity (0–1)
        is_gap            (bool)          — True if similarity < GAP_THRESHOLD
    """
    required_skills: list[dict] = assignment.get("matched_skills", [])
    employee_skills: list[dict] | None = assignment.get("employee_skills")

    # If no employee is assigned, every required skill is a gap
    if not employee_skills:
        return [
            {
                "required_code": s["code"],
                "required_name": s["name"],
                "required_category": s.get("category", ""),
                "best_match_code": None,
                "best_match_name": None,
                "best_match_level": None,
                "similarity": 0.0,
                "is_gap": True,
            }
            for s in required_skills
        ]

    code_to_index = _get_code_to_index()
    skill_embeddings = get_skill_embeddings()

    # Build matrix of employee skill embeddings (one row per employee skill)
    emp_indices: list[int] = []
    valid_emp_skills: list[dict] = []
    for skill in employee_skills:
        idx = code_to_index.get(skill["code"])
        if idx is not None:
            emp_indices.append(idx)
            valid_emp_skills.append(skill)

    rows = []
    for req in required_skills:
        req_idx = code_to_index.get(req["code"])

        if req_idx is None or not emp_indices:
            rows.append(
                {
                    "required_code": req["code"],
                    "required_name": req["name"],
                    "required_category": req.get("category", ""),
                    "best_match_code": None,
                    "best_match_name": None,
                    "best_match_level": None,
                    "similarity": 0.0,
                    "is_gap": True,
                }
            )
            continue

        req_vec = skill_embeddings[req_idx]  # (D,)
        emp_vecs = skill_embeddings[emp_indices]  # (M, D)

        # Dot product == cosine similarity because embeddings are normalised.
        # Clip to [0, 1] to guard against tiny floating-point overflows.
        sims = np.clip(emp_vecs @ req_vec, 0.0, 1.0)  # (M,)
        best_pos = int(np.argmax(sims))
        best_sim = float(sims[best_pos])
        best_skill = valid_emp_skills[best_pos]

        rows.append(
            {
                "required_code": req["code"],
                "required_name": req["name"],
                "required_category": req.get("category", ""),
                "best_match_code": best_skill["code"],
                "best_match_name": best_skill["name"],
                "best_match_level": best_skill.get("level"),
                "similarity": best_sim,
                "is_gap": best_sim < GAP_THRESHOLD,
            }
        )

    return rows
