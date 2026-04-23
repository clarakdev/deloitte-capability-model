"""
Embedding engine: loads the sentence-transformer model and provides cached
embeddings for all SFIA skills and arbitrary text inputs.

The skill embeddings are computed once and written to data/skill_embeddings.npy
alongside a data/skill_codes.json index so subsequent runs skip recomputation.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_DATA_DIR = Path(__file__).parent.parent / "data"
_SKILLS_PATH = _DATA_DIR / "sfia_skills.json"
_EMBEDDINGS_PATH = _DATA_DIR / "skill_embeddings.npy"
_CODES_PATH = _DATA_DIR / "skill_codes.json"

_model: SentenceTransformer | None = None
_skills: list[dict] | None = None
_skill_embeddings: np.ndarray | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def get_skills() -> list[dict]:
    """Return all SFIA skills loaded from disk (cached in memory)."""
    global _skills
    if _skills is None:
        with open(_SKILLS_PATH, encoding="utf-8") as f:
            _skills = json.load(f)
    return _skills


def get_skill_embeddings() -> np.ndarray:
    """
    Return a (N, D) array of embeddings for all SFIA skills, one row per skill
    in the same order as get_skills(). Computed once and cached to disk.
    """
    global _skill_embeddings
    if _skill_embeddings is not None:
        return _skill_embeddings

    skills = get_skills()
    current_codes = [s["code"] for s in skills]

    # Use disk cache if it matches the current skill list
    if _EMBEDDINGS_PATH.exists() and _CODES_PATH.exists():
        cached_codes = json.loads(_CODES_PATH.read_text(encoding="utf-8"))
        if cached_codes == current_codes:
            _skill_embeddings = np.load(str(_EMBEDDINGS_PATH))
            return _skill_embeddings

    # Compute embeddings: embed "name: description" for richer context
    model = _get_model()
    texts = [f"{s['name']}: {s['description']}" for s in skills]
    _skill_embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)

    # Persist to disk
    np.save(str(_EMBEDDINGS_PATH), _skill_embeddings)
    _CODES_PATH.write_text(json.dumps(current_codes), encoding="utf-8")

    return _skill_embeddings


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a list of arbitrary strings, returning a (N, D) normalised array."""
    model = _get_model()
    return model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
