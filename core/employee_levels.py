"""Deloitte employee role level definitions and validation helpers."""

ROLE_LEVELS = [
    "Analyst",
    "Consultant",
    "Senior Consultant",
    "Manager",
    "Senior Manager",
    "Director",
    "Partner",
]

ROLE_LEVEL_RANK = {level: rank for rank, level in enumerate(ROLE_LEVELS, start=1)}


def is_valid_role_level(level: str) -> bool:
    """Return True if the provided level is one of the official Deloitte levels."""
    return isinstance(level, str) and level in ROLE_LEVEL_RANK


def role_level_rank(level: str) -> int | None:
    """Return the numeric rank for an official Deloitte role level, or None."""
    if not isinstance(level, str):
        return None
    return ROLE_LEVEL_RANK.get(level)
