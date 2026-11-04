"""
Auth endpoints.

There are no accounts. Each browser gets an anonymous identity: the server
mints a random user id and returns a signed JWT for it, which the SPA keeps in
localStorage. Because the id is generated server-side, a caller cannot choose
(and so cannot impersonate) someone else's id — they can only obtain a fresh one.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


@router.post("/anon", response_model=TokenResponse)
async def issue_anonymous_token():
    user_id = f"anon-{uuid.uuid4().hex}"
    return TokenResponse(access_token=create_access_token(user_id), user_id=user_id)


@router.get("/me")
async def me(user_id: str = Depends(get_current_user)):
    return {"data": {"user_id": user_id}}
