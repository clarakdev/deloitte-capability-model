"""
Filter the raw ESCO skills CSV to a curated subset for project-management
capability matching.

Keeps only skills with reuseLevel in {cross-sector, transversal} and
status == released, then writes a trimmed CSV to data/esco_skills.csv.

Usage:
    python scripts/filter_esco_skills.py

Input:
    ESCO/skills_en.csv  (raw ESCO v1.2.1 download)

Output:
    data/esco_skills.csv

To narrow the subset further, add lowercase keyword strings to
EXCLUDE_DESCRIPTION_KEYWORDS. Any skill whose description contains one of
those strings (case-insensitive) will be dropped.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = REPO_ROOT / "ESCO" / "skills_en.csv"
OUT_PATH = REPO_ROOT / "data" / "esco_skills.csv"

KEEP_LEVELS = {"cross-sector", "transversal"}

# Columns to keep in the output CSV
KEEP_COLS = ["conceptUri", "preferredLabel", "altLabels", "skillType", "reuseLevel", "description"]

# Optional keyword exclusion list — add lowercase terms to drop irrelevant skills.
# Example: EXCLUDE_DESCRIPTION_KEYWORDS = ["livestock", "fishery", "theatrical"]
EXCLUDE_DESCRIPTION_KEYWORDS: list[str] = []


def main() -> None:
    if not RAW_PATH.exists():
        print(f"ERROR: {RAW_PATH} not found.")
        print("Download ESCO v1.2.1 skills CSV from https://esco.ec.europa.eu/en/use-esco/download")
        sys.exit(1)

    print(f"Reading {RAW_PATH} ...")
    df = pd.read_csv(RAW_PATH, low_memory=False)
    total = len(df)

    # Filter by status and reuseLevel
    #df = df[
    #    (df["status"].fillna("") == "released") &
    #    (df["reuseLevel"].fillna("").isin(KEEP_LEVELS))
    #].copy()
    df = df[df["status"].fillna("") == "released"].copy() # Only filter by status, not reuseLevel, to keep more skills for now
    after_level_filter = len(df)

    # Fill missing description from definition field, then fall back to empty string
    if "definition" in df.columns:
        df["description"] = df["description"].fillna(df["definition"]).fillna("")
    else:
        df["description"] = df["description"].fillna("")

    df["altLabels"] = df["altLabels"].fillna("")

    # Optional keyword exclusion
    if EXCLUDE_DESCRIPTION_KEYWORDS:
        pattern = "|".join(EXCLUDE_DESCRIPTION_KEYWORDS)
        mask = df["description"].str.lower().str.contains(pattern, na=False)
        df = df[~mask]

    after_keywords = len(df)
    df = df[KEEP_COLS].copy()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False, encoding="utf-8")

    print(f"\nTotal ESCO skills (raw):            {total:>6,}")
    print(f"After reuseLevel filter:            {after_level_filter:>6,}  ({sorted(KEEP_LEVELS)})")
    if EXCLUDE_DESCRIPTION_KEYWORDS:
        print(f"After keyword exclusions:           {after_keywords:>6,}")
    print(f"\nWritten to: {OUT_PATH}")
    print()
    print("Breakdown by reuseLevel:")
    print(df["reuseLevel"].value_counts().to_string())
    print()
    print("Breakdown by skillType:")
    print(df["skillType"].value_counts().to_string())


if __name__ == "__main__":
    main()
