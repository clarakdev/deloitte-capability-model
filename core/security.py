from datetime import datetime, timedelta
from typing import Any, Dict

from jose import jwt
from passlib.context import CryptContext

# Secret signing key used to protect JWT integrity. In production this should be
# stored in a secure environment variable rather than hard-coded in source.
SECRET_KEY: str = "DELOITTE_CAPABILITY_MATCHER_SECRET_2026"
# The hashing algorithm used when issuing and validating JSON Web Tokens.
ALGORITHM: str = "HS256"
# Lifetime of an issued access token in minutes, controlling how long a user
# session remains valid before the token should be treated as expired.
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

# Passlib's CryptContext configures password hashing with the bcrypt scheme.
# bcrypt automatically applies a random salt and performs a slow, salted hash so
# plain-text passwords are not stored directly and are resilient to rainbow-table
# attacks.
pwd_context: CryptContext = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
