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


# ------------------------------------------------------------ device transfer
# Lets the same identity (watchlists, alerts, paper trades, push devices) be
# used on a second device without accounts: the first device asks for a short
# one-time code, the second redeems it for its own token. Codes live 10
# minutes in Redis and work once. 8 characters from a 31-letter alphabet is
# ~8.5e11 combinations, and redeem attempts are capped per client, so codes
# can't be guessed.
import secrets as _secrets

from fastapi import HTTPException, Request

from app.core.redis import get_redis

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
TRANSFER_TTL = 600
MAX_REDEEM_TRIES = 20


class TransferCode(BaseModel):
    code: str
    expires_in: int


class RedeemIn(BaseModel):
    code: str


def _norm_code(code: str) -> str:
    return "".join(c for c in code.upper() if c.isalnum())


@router.post("/transfer", response_model=TransferCode)
async def create_transfer_code(user_id: str = Depends(get_current_user)):
    code = "".join(_secrets.choice(_ALPHABET) for _ in range(8))
    try:
        await get_redis().set(f"xfer:{code}", user_id, ex=TRANSFER_TTL)
    except Exception:
        raise HTTPException(503, "Couldn't create a code right now. Try again in a minute.")
    return TransferCode(code=f"{code[:4]}-{code[4:]}", expires_in=TRANSFER_TTL)


@router.post("/transfer/redeem", response_model=TokenResponse)
async def redeem_transfer_code(body: RedeemIn, request: Request):
    code = _norm_code(body.code)
    r = get_redis()
    client = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "unknown")
    tries_key = f"xfer:tries:{client}"
    try:
        tries = await r.incr(tries_key)
        if tries == 1:
            await r.expire(tries_key, TRANSFER_TTL)
        if tries > MAX_REDEEM_TRIES:
            raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
        user_id = await r.getdel(f"xfer:{code}") if len(code) == 8 else None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Couldn't check the code right now. Try again in a minute.")
    if not user_id:
        raise HTTPException(404, "That code is wrong or has expired. Make a new one on your other device.")
    user_id = user_id.decode() if isinstance(user_id, bytes) else user_id
    return TokenResponse(access_token=create_access_token(user_id), user_id=user_id)
