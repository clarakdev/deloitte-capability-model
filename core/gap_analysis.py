"""
Gap analysis: per-capability fit breakdown for a specific employee.

Public API
----------
analyse_fit(role_capabilities, employee) → list[dict]

For each required capability in `role_capabilities`, this module finds the
employee's closest DPN skill (by cosine similarity of their embeddings) and
flags it as a gap if the similarity falls below GAP_THRESHOLD.

Return format
-------------
One dict per capability, ordered to match role_capabilities:

    {
        "cap_id":           str,    # ESCO conceptUri
        "cap_name":         str,    # ESCO preferredLabel
        "weight":           int,    # PM-assigned importance (1–5)
        "best_match_skill": str | None,  # DPN skill name with highest similarity
        "similarity":       float,  # cosine similarity 0–1 (0 if no skills)
        "is_gap":           bool,   # True if similarity < GAP_THRESHOLD
    }

If the employee has no embeddable skills at all, every capability is returned
as a gap with similarity 0.0.
"""

from __future__ import annotations

import numpy as np

from .embedding_engine import embed_texts

# Cosine similarity below this threshold is treated as a meaningful gap
GAP_THRESHOLD = 0.6


def analyse_fit(role_capabilities: list[dict], employee: dict) -> list[dict]:
    """
    Return a per-capability fit breakdown for the given employee.

    Parameters
    ----------
    role_capabilities : List of capability dicts containing at least:
                        "cap_id", "name", "embedding", "weight".
    employee :          DPN employee dict.

    Returns
    -------
    List of fit dicts (see module docstring), one per capability.
    """
    # ── Build employee skill embedding matrix ─────────────────────────────
    skill_names = [
        s["name"].strip()
        for s in employee.get("skills", [])
        if s.get("name", "").strip()
    ]

    skill_embs: np.ndarray | None = None  # (K, D) if K > 0
    if skill_names:
        skill_embs = embed_texts(skill_names)  # (K, D), L2-normalised

    # ── Score each capability against the employee's skills ───────────────
    results: list[dict] = []

    for cap in role_capabilities:
        cap_emb = cap.get("embedding")

        if cap_emb is None or skill_embs is None:
            results.append({
                "cap_id":           cap.get("cap_id", ""),
                "cap_name":         cap.get("name", ""),
                "weight":           cap.get("weight", 1),
                "best_match_skill": None,
                "similarity":       0.0,
                "is_gap":           True,
            })
            continue

        cap_emb = np.asarray(cap_emb, dtype=np.float32)

        # Cosine similarity between cap and each skill (dot product — both normalised)
        sims = skill_embs @ cap_emb  # (K,)
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])
        best_sim = max(0.0, min(1.0, best_sim))  # clip to [0, 1]

        results.append({
            "cap_id":           cap.get("cap_id", ""),
            "cap_name":         cap.get("name", ""),
            "weight":           cap.get("weight", 1),
            "best_match_skill": skill_names[best_idx],
            "similarity":       round(best_sim, 4),
            "is_gap":           best_sim < GAP_THRESHOLD,
        })

    return results
