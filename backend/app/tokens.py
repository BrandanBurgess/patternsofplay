"""Session tokens: a JWT carried in an httpOnly cookie (doc 04 section 2).

No app state lives in localStorage or in the token payload beyond the
user id; the server is the source of truth for user, team, and role on
every request (Brief section 7).
"""

import time

import jwt

from app.config import JWT_ALGORITHM, JWT_SECRET, JWT_TTL_SECONDS


def create_session_token(user_id: int) -> str:
    now = int(time.time())
    payload = {"sub": str(user_id), "iat": now, "exp": now + JWT_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
