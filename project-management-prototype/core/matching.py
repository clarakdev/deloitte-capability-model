"""
Matching engine: assigns employees to roles using the Hungarian algorithm.

Each employee's capability is represented as a weighted mean of their SFIA
skill embeddings (weighted by proficiency level 1–7, then unit-normalised).
The cost matrix is 1 − cosine_similarity(employee_vector, role_vector).
scipy.optimize.linear_sum_assignment finds the globally optimal 1:1 assignment.

If there are more roles than employees, surplus roles are marked unassigned.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import linear_sum_assignment

from .embedding_engine import get_skill_embeddings, get_skills

# Mapping from SFIA skill code to its index in the embeddings array,
# built lazily and cached.
_code_to_index: dict[str, int] | None = None


def _get_code_to_index() -> dict[str, int]:
    global _code_to_index
    if _code_to_index is None:
        _code_to_index = {s["code"]: i for i, s in enumerate(get_skills())}
    return _code_to_index


def _employee_vector(employee: dict) -> np.ndarray | None:
    """
    Compute a unit-normalised capability vector for an employee.

    Each skill contributes its embedding weighted by proficiency level (1–7).
    Returns None if the employee has no recognised skills.
    """
    code_to_index = _get_code_to_index()
    skill_embeddings = get_skill_embeddings()

    vectors: list[np.ndarray] = []
    weights: list[float] = []

    for skill in employee.get("skills", []):
        idx = code_to_index.get(skill["code"])
        if idx is None:
            continue
        vectors.append(skill_embeddings[idx])
        weights.append(float(skill.get("level", 1)))

    if not vectors:
        return None

    weight_arr = np.array(weights)
    weight_arr = weight_arr / weight_arr.sum()
    vec = (np.stack(vectors) * weight_arr[:, None]).sum(axis=0)

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec


def assign(employees: list[dict], roles: list[dict]) -> list[dict]:
    """
    Assign employees to roles and return a list of assignment dicts.

    Each role dict must contain:
        title       (str)
        description (str)
        project     (str)
        role_vector (np.ndarray, from role_mapper.map_role_to_skills)
        matched_skills (list of dicts, from role_mapper.map_role_to_skills)

    Each assignment dict contains:
        role_title      (str)
        role_description (str)
        project         (str)
        matched_skills  (list of dicts)  — role's required skills
        employee_id     (str | None)
        employee_name   (str | None)
        employee_skills (list of dicts | None)
        similarity      (float)          — 0.0 if unassigned
        role_vector     (np.ndarray)
        employee_vector (np.ndarray | None)
    """
    n_roles = len(roles)
    n_employees = len(employees)

    # Build employee vectors
    emp_vectors = [_employee_vector(e) for e in employees]

    # For employees with no recognised skills, use a zero vector so they still
    # participate in the assignment but score zero similarity everywhere.
    emb_dim = get_skill_embeddings().shape[1]
    emp_vecs_safe = [
        v if v is not None else np.zeros(emb_dim) for v in emp_vectors
    ]
    role_vecs = [r["role_vector"] for r in roles]

    # Cost matrix: (n_employees x n_roles), cost = 1 - cosine_similarity
    emp_mat = np.stack(emp_vecs_safe)   # (E, D)
    role_mat = np.stack(role_vecs)       # (R, D)
    sim_matrix = emp_mat @ role_mat.T    # (E, R) — cosine sim (both normalised)
    cost_matrix = 1.0 - sim_matrix       # (E, R)

    if n_employees >= n_roles:
        # Standard case: more (or equal) employees than roles
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        # col_ind[i] = role index assigned to employee row_ind[i]
        role_assignment: dict[int, int] = {
            col: row for row, col in zip(row_ind, col_ind)
        }
    else:
        # Fewer employees than roles: pad cost matrix with dummy employees
        # (cost = 1.0 everywhere) so every role gets an assignment attempt,
        # then flag roles whose "employee" is a dummy as unassigned.
        padding = np.ones((n_roles - n_employees, n_roles))
        padded = np.vstack([cost_matrix, padding])
        row_ind, col_ind = linear_sum_assignment(padded)
        role_assignment = {
            col: row for row, col in zip(row_ind, col_ind)
        }

    assignments = []
    for role_idx, role in enumerate(roles):
        emp_idx = role_assignment.get(role_idx)
        is_real_employee = emp_idx is not None and emp_idx < n_employees

        if is_real_employee:
            emp = employees[emp_idx]
            similarity = float(np.clip(sim_matrix[emp_idx, role_idx], 0.0, 1.0))
        else:
            emp = None
            similarity = 0.0

        assignments.append(
            {
                "role_title": role["title"],
                "role_description": role["description"],
                "project": role["project"],
                "matched_skills": role["matched_skills"],
                "role_vector": role["role_vector"],
                "employee_id": emp["id"] if emp else None,
                "employee_name": emp["name"] if emp else None,
                "employee_skills": emp["skills"] if emp else None,
                "employee_vector": emp_vectors[emp_idx] if is_real_employee else None,
                "similarity": similarity,
            }
        )

    return assignments
