"""
Pre-compute sentence-transformer embeddings for every skill in
data/esco_skills.csv and cache them to disk.

Embeddings are stored as a (N, D) float32 array in data/esco_embeddings.npy.
A matching list of conceptUris is stored in data/esco_codes.json so that the
embedding engine can validate cache freshness at startup.

Each skill is embedded as: "<preferredLabel>. <description>"
If description is empty, only the label is used.

Usage:
    python scripts/precompute_embeddings.py

Requires data/esco_skills.csv to exist (run filter_esco_skills.py first).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
SKILLS_PATH = DATA_DIR / "esco_skills.csv"
EMBEDDINGS_PATH = DATA_DIR / "esco_embeddings.npy"
CODES_PATH = DATA_DIR / "esco_codes.json"


def build_embedding_text(label: str, description: str) -> str:
    label = label.strip()
    description = description.strip() if description else ""
    if description:
        return f"{label}. {description}"
    return label


def main() -> None:
    if not SKILLS_PATH.exists():
        print(f"ERROR: {SKILLS_PATH} not found.")
        print("Run scripts/filter_esco_skills.py first.")
        sys.exit(1)

    df = pd.read_csv(SKILLS_PATH)
    df["description"] = df["description"].fillna("")

    uris = df["conceptUri"].tolist()
    texts = [
        build_embedding_text(row["preferredLabel"], row["description"])
        for _, row in df.iterrows()
    ]

    print(f"Loaded {len(texts):,} skills from {SKILLS_PATH.name}")
    print(f"Loading model '{_MODEL_NAME}' ...")
    model = SentenceTransformer(_MODEL_NAME)

    print("Computing embeddings (this may take a minute or two) ...")
    embeddings = model.encode(
        texts,
        batch_size=256,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.save(str(EMBEDDINGS_PATH), embeddings.astype(np.float32))
    CODES_PATH.write_text(json.dumps(uris, ensure_ascii=False), encoding="utf-8")

    print(f"\nEmbeddings shape: {embeddings.shape}")
    print(f"Saved to:         {EMBEDDINGS_PATH}")
    print(f"URI index saved:  {CODES_PATH}")


if __name__ == "__main__":
    main()
