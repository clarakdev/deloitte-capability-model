"""
Capability inference: maps a role title + description to its top-N ESCO
capabilities by semantic similarity.

Public API
----------
infer_capabilities(title, description, top_k=5) → list[dict]

Each returned capability dict has the shape used throughout the application:

    {
        "cap_id":           str,        # ESCO conceptUri
        "name":             str,        # ESCO preferredLabel
        "esco_description": str,        # ESCO description (may be empty)
        "embedding":        np.ndarray, # (D,) float32, L2-normalised
        "weight":           int,        # default importance (1–5)
        "is_inferred":      bool,       # True = added by inference, not by PM
    }

The role is represented as the embedding of "{title}: {description}".
The top_k ESCO skills with highest cosine similarity to this vector are
returned, ordered by descending similarity.
"""

from __future__ import annotations

import numpy as np

from .embedding_engine import embed_texts, get_esco_embeddings, get_esco_skills

# Default number of capabilities inferred per role
TOP_K = 5

# Default importance weight assigned to inferred capabilities
DEFAULT_WEIGHT = 3


def infer_capabilities(title: str, description: str, top_k: int = TOP_K) -> list[dict]:
    """
    Return the top_k ESCO capabilities that best match the role.

    Parameters
    ----------
    title :       Role title (e.g. "Solution Architect")
    description : Role description text
    top_k :       Number of capabilities to return (default: 5)

    Returns
    -------
    list of capability dicts, ordered by descending similarity to the role.
    """
    skills = get_esco_skills()
    esco_embs = get_esco_embeddings()  # (N, D), already L2-normalised

    role_text = f"{title}: {description}"
    role_emb = embed_texts([role_text])[0]  # (D,)

    # Cosine similarity: dot product of normalised vectors
    sims = esco_embs @ role_emb  # (N,)

    top_k = min(top_k, len(skills))
    top_indices = np.argsort(sims)[::-1][:top_k]

    return [
        {
            "cap_id": skills[i]["conceptUri"],
            "name": skills[i]["preferredLabel"],
            "esco_description": skills[i]["description"],
            "embedding": esco_embs[i].copy(),
            "weight": DEFAULT_WEIGHT,
            "is_inferred": True,
        }
        for i in top_indices
    ]
