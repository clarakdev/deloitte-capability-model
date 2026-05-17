"""
Embedding engine: sentence-transformer singleton and ESCO skill cache.

All other core modules import from here. Nothing in this module should import
from other core modules (no circular dependencies).

Public API
----------
get_model()           → SentenceTransformer
get_esco_skills()     → list[dict]  — all curated ESCO skills (esco_skills.csv)
get_esco_embeddings() → np.ndarray  — (N, D) float32, L2-normalised rows
get_uri_to_index()    → dict[str, int]  — ESCO URI → row index in embeddings array
embed_texts(texts)    → np.ndarray  — (len(texts), D) L2-normalised
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_SKILLS_PATH = _DATA_DIR / "esco_skills.csv"
_EMBEDDINGS_PATH = _DATA_DIR / "esco_embeddings.npy"
_CODES_PATH = _DATA_DIR / "esco_codes.json"

# Module-level singletons — populated lazily
_model: SentenceTransformer | None = None
_esco_skills: list[dict] | None = None
_esco_embeddings: np.ndarray | None = None
_uri_to_index: dict[str, int] | None = None


def get_model() -> SentenceTransformer:
    """Return the shared SentenceTransformer instance (loaded once)."""
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def get_esco_skills() -> list[dict]:
    """Return all curated ESCO skills as a list of dicts (loaded once)."""
    global _esco_skills
    if _esco_skills is not None:
        return _esco_skills

    df = pd.read_csv(_SKILLS_PATH)
    df["description"] = df["description"].fillna("")
    df["altLabels"] = df["altLabels"].fillna("")
    _esco_skills = df.to_dict(orient="records")
    return _esco_skills


def get_esco_embeddings() -> np.ndarray:
    """
    Return the (N, D) float32 ESCO skill embedding matrix (loaded once).

    Loaded from the pre-computed cache. If the cache is missing or stale,
    embeddings are recomputed on-the-fly (slow — run precompute_embeddings.py
    in advance).
    """
    global _esco_embeddings
    if _esco_embeddings is not None:
        return _esco_embeddings

    skills = get_esco_skills()
    current_uris = [s["conceptUri"] for s in skills]

    if _EMBEDDINGS_PATH.exists() and _CODES_PATH.exists():
        cached_uris = json.loads(_CODES_PATH.read_text(encoding="utf-8"))
        if cached_uris == current_uris:
            _esco_embeddings = np.load(str(_EMBEDDINGS_PATH)).astype(np.float32)
            return _esco_embeddings

    # Cache miss — recompute (fallback, should not happen in normal use)
    print("WARNING: ESCO embedding cache missing or stale — recomputing (run precompute_embeddings.py to avoid this).")
    texts = [
        f"{s['preferredLabel']}. {s['description']}" if s["description"]
        else s["preferredLabel"]
        for s in skills
    ]
    model = get_model()
    embs = model.encode(texts, batch_size=256, show_progress_bar=True, normalize_embeddings=True)
    _esco_embeddings = embs.astype(np.float32)

    np.save(str(_EMBEDDINGS_PATH), _esco_embeddings)
    _CODES_PATH.write_text(json.dumps(current_uris, ensure_ascii=False), encoding="utf-8")
    return _esco_embeddings


def get_uri_to_index() -> dict[str, int]:
    """Return a dict mapping ESCO conceptUri → row index in get_esco_embeddings()."""
    global _uri_to_index
    if _uri_to_index is None:
        _uri_to_index = {s["conceptUri"]: i for i, s in enumerate(get_esco_skills())}
    return _uri_to_index


def embed_texts(texts: list[str]) -> np.ndarray:
    """
    Embed a list of arbitrary strings.

    Returns a (len(texts), D) float32 array of L2-normalised vectors.
    Empty or whitespace-only strings should not be passed — filter them
    before calling this function.
    """
    model = get_model()
    return model.encode(
        texts,
        batch_size=256,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype(np.float32)
