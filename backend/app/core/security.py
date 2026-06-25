"""
Auth primitives — HS256 JWT issue/verify.

MVP posture: in production set AUTH_SECRET and issue tokens via POST /auth/token.
In dev (AUTH_SECRET blank) the dependency falls back to an X-User-Id header or a
"demo" user so the frontend works with zero setup. Swap the token endpoint for
Supabase Auth / magic links later — the get_current_user seam stays identical.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.AUTH_TOKEN_TTL_MIN),
    }
    secret = settings.AUTH_SECRET or "dev-insecure-secret"
    return jwt.encode(payload, secret, algorithm=settings.AUTH_ALGORITHM)


def decode_token(token: str) -> str:
    """Return user_id (sub) or raise jwt exceptions."""
    secret = settings.AUTH_SECRET or "dev-insecure-secret"
    payload = jwt.decode(token, secret, algorithms=[settings.AUTH_ALGORITHM])
    return payload["sub"]
