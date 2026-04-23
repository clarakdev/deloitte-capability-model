"""
Role mapper: converts a role title and description into a capability profile.

A capability profile consists of:
  - matched_skills: the top-K most semantically similar SFIA skills
  - role_vector: a single embedding vector representing the role, computed as
    the mean of the top-K skill embeddings (unit-normalised)
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from .embedding_engine import embed_texts, get_skill_embeddings, get_skills

# Number of SFIA skills used to represent each role
TOP_K = 5


def map_role_to_skills(title: str, description: str, top_k: int = TOP_K) -> dict:
    """
    Map a role (title + description) to its top-K SFIA skills.

    Returns a dict with:
        matched_skills: list of dicts, each with keys code, name, category,
                        description, similarity (float)
        role_vector:    np.ndarray of shape (D,) — unit-normalised mean of
                        the top-K skill embeddings
    """
    skills = get_skills()
    skill_embeddings = get_skill_embeddings()  # (N, D), already normalised

    # Embed the role as "title: description"
    role_text = f"{title}: {description}"
    role_emb = embed_texts([role_text])[0]  # (D,)

    # Cosine similarity of role against every skill (embeddings are normalised,
    # so dot product == cosine similarity)
    sims = skill_embeddings @ role_emb  # (N,)

    top_indices = np.argsort(sims)[::-1][:top_k]

    matched_skills = [
        {
            **skills[i],
            "similarity": float(sims[i]),
        }
        for i in top_indices
    ]

    # Role vector: mean of top-K skill embeddings, re-normalised
    top_embs = skill_embeddings[top_indices]  # (top_k, D)
    role_vector = top_embs.mean(axis=0)
    norm = np.linalg.norm(role_vector)
    if norm > 0:
        role_vector = role_vector / norm

    return {
        "matched_skills": matched_skills,
        "role_vector": role_vector,
    }
