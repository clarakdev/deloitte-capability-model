"""
Employee profile: builds a composite capability vector for a DPN employee
and provides the prior-experience check used by the US005 filter.

Public API
----------
build_employee_vector(employee) → np.ndarray | None
    Returns a (D,) float32 L2-normalised composite vector, or None if the
    employee's profile contains no embeddable content.

has_prior_experience(employee, role_title) → bool
    Case-insensitive exact-title match against the employee's prior_roles list.

Composite vector formula
------------------------
Two components are combined with soft weights:

    primary   (target weight 0.6):
        Mean of skill-name embeddings for each item in employee["skills"].
        Binary — every present skill contributes equally (no proficiency level).

    secondary (target weight 0.4):
        Mean of the following text embeddings (each included only if non-empty):
          • employee["summary"]
          • employee["tools"] joined as ", "
          • employee["prior_roles"] joined as ", "

If one component produces no embeddings (e.g. skills list is empty) the other
component is used at full weight. If neither produces any embeddings, None is
returned.

The result is always L2-normalised.
"""

from __future__ import annotations

import numpy as np

from .embedding_engine import embed_texts

# Target blend weights
_W_PRIMARY = 0.6
_W_SECONDARY = 0.4


def build_employee_vector(employee: dict) -> np.ndarray | None:
    """Build and return a (D,) composite capability vector for the employee."""

    # ── Primary component: skill name embeddings ──────────────────────────
    skill_names = [
        s["name"].strip()
        for s in employee.get("skills", [])
        if s.get("name", "").strip()
    ]
    primary: np.ndarray | None = None
    if skill_names:
        embs = embed_texts(skill_names)     # (K, D)
        primary = embs.mean(axis=0)         # (D,)

    # ── Secondary component: narrative/context text embeddings ────────────
    secondary_texts: list[str] = []

    summary = employee.get("summary", "").strip()
    if summary:
        secondary_texts.append(summary)

    tools = employee.get("tools", [])
    if tools:
        secondary_texts.append(", ".join(str(t) for t in tools))

    prior_roles = employee.get("prior_roles", [])
    if prior_roles:
        secondary_texts.append(", ".join(str(r) for r in prior_roles))

    secondary: np.ndarray | None = None
    if secondary_texts:
        embs = embed_texts(secondary_texts)  # (M, D)
        secondary = embs.mean(axis=0)        # (D,)

    # ── Blend ─────────────────────────────────────────────────────────────
    if primary is not None and secondary is not None:
        vec = _W_PRIMARY * primary + _W_SECONDARY * secondary
    elif primary is not None:
        vec = primary
    elif secondary is not None:
        vec = secondary
    else:
        return None

    norm = np.linalg.norm(vec)
    if norm == 0.0:
        return None
    return (vec / norm).astype(np.float32)


def has_prior_experience(employee: dict, role_title: str) -> bool:
    """
    Return True if `role_title` appears (case-insensitively) in the
    employee's prior_roles list.
    """
    target = role_title.strip().lower()
    return any(r.strip().lower() == target for r in employee.get("prior_roles", []))
