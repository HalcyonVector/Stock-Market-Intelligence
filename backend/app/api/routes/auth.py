"""
Auth endpoints.

MVP: a passwordless dev token issuer so the SPA can obtain a JWT. Replace with
Supabase Auth / magic links / OAuth in production (see docs/13-DEPLOYMENT.md).
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.security import create_access_token
from fastapi import Depends

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenRequest(BaseModel):
    user_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/token", response_model=TokenResponse)
async def issue_token(body: TokenRequest):
    return TokenResponse(access_token=create_access_token(body.user_id))


@router.get("/me")
async def me(user_id: str = Depends(get_current_user)):
    return {"data": {"user_id": user_id}}
