from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Dict

from dotenv import load_dotenv
from jose import jwt
from passlib.context import CryptContext
from supabase import Client, create_client

load_dotenv()

# Secret signing key used to protect JWT integrity. This is sourced from the
# Supabase JWT secret configured in the current environment.
SECRET_KEY: str = os.getenv("SUPABASE_JWT_SECRET", "")
# The hashing algorithm used when validating JSON Web Tokens.
ALGORITHM: str = "HS256"
# Lifetime of an issued access token in minutes, controlling how long a user
# session remains valid before the token should be treated as expired.
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

# Passlib's CryptContext configures password hashing with the bcrypt scheme.
# bcrypt automatically applies a random salt and performs a slow, salted hash so
# plain-text passwords are not stored directly and are resilient to rainbow-table
# attacks.
pwd_context: CryptContext = CryptContext(schemes=["bcrypt"], deprecated="auto")

_SUPABASE_CLIENT: Client | None = None
_SUPABASE_SERVICE_ROLE_CLIENT: Client | None = None


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_supabase_client() -> Client:
    """Create and cache a Supabase client from environment configuration."""
    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is None:
        supabase_url = _get_required_env("SUPABASE_URL")
        supabase_key = _get_required_env("SUPABASE_KEY")
        _SUPABASE_CLIENT = create_client(supabase_url, supabase_key)
    return _SUPABASE_CLIENT


def get_supabase_service_role_client() -> Client:
    """Create and cache a Supabase client using the service-role key for server-side lookups."""
    global _SUPABASE_SERVICE_ROLE_CLIENT
    if _SUPABASE_SERVICE_ROLE_CLIENT is None:
        supabase_url = _get_required_env("SUPABASE_URL")
        service_role_key = _get_required_env("SUPABASE_SERVICE_ROLE_KEY")
        _SUPABASE_SERVICE_ROLE_CLIENT = create_client(supabase_url, service_role_key)
    return _SUPABASE_SERVICE_ROLE_CLIENT


def decode_supabase_access_token(token: str) -> Any:
    """Validate a Supabase-issued JWT through the Supabase Auth API."""
    client = get_supabase_client()
    response = client.auth.get_user(token)
    if getattr(response, "user", None) is None:
        raise RuntimeError("Supabase authentication response did not contain a user")
    return response


def resolve_profile_from_user_id(user_id: str) -> Dict[str, Any] | None:
    """Resolve the authenticated user's role and employee_id from the profiles table."""
    client = get_supabase_service_role_client()
    response = client.table("profiles").select(
        "id, employee_id, role, first_name, last_name"
    ).eq("id", user_id).execute()
    data = getattr(response, "data", None)
    if not data:
        return None
    if isinstance(data, list):
        return data[0] if data else None
    return data if isinstance(data, dict) else None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a stored bcrypt hash.

    This function uses passlib's bcrypt-backed verification routine to compare the
    submitted password with the stored hash. bcrypt internally re-computes the hash
    using the stored salt and the supplied password, then compares the results to
    confirm authenticity without exposing the original password.
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a plain-text password with bcrypt using passlib.

    The returned string contains the bcrypt hash, the random salt, and the cost
    factor required for later verification. This ensures passwords are never stored
    as plain text and that each hash is unique even for identical inputs.
    """
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any]) -> str:
    """Create a signed JWT access token with an expiration claim.

    The function copies the input claims, appends an ``exp`` claim based on the
    current UTC time plus ACCESS_TOKEN_EXPIRE_MINUTES, and then signs the payload
    with SECRET_KEY using the configured ALGORITHM. The resulting token can be
    validated by downstream endpoints, and the expiration claim protects user
    sessions by forcing the token to become invalid after its lifetime expires.
    """
    to_encode: Dict[str, Any] = data.copy()
    expire: datetime = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt: str = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
