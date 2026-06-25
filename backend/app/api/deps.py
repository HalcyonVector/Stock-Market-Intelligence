"""Reusable API dependencies: market selection + authenticated user."""
from __future__ import annotations

import jwt
from fastapi import Header, HTTPException, status

from app.core.config import settings
from app.core.security import decode_token


def default_market(market: str | None = None) -> str:
    return (market or settings.DEFAULT_MARKET).upper()


def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
) -> str:
    """
    Resolve the calling user id.

    - Bearer token present -> verify JWT, return its subject.
    - No token + AUTH_SECRET unset (dev) -> use X-User-Id header or "demo".
    - No token + AUTH_SECRET set (prod) -> 401.
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        try:
            return decode_token(token)
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
    if not settings.AUTH_SECRET:
        return x_user_id or "demo"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
