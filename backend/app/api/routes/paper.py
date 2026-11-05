"""Paper trading endpoints — virtual money, scoped to the browser's anonymous identity."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_session
from app.services import paper as svc

router = APIRouter(prefix="/paper", tags=["paper"])


class OrderIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    side: Literal["buy", "sell"]
    quantity: float = Field(gt=0, le=1_000_000)


@router.get("")
async def account(user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    return {"data": await svc.summary(db, user)}


@router.post("/orders", status_code=201)
async def order(body: OrderIn, user: str = Depends(get_current_user),
                db: AsyncSession = Depends(get_session)):
    return {"data": await svc.place_order(db, user, body.symbol, body.side, body.quantity)}


@router.post("/reset")
async def reset(user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    await svc.reset(db, user)
    return {"data": await svc.summary(db, user)}


@router.get("/history")
async def history(user: str = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    """Daily account value per currency vs. a benchmark index."""
    return {"data": await svc.history(db, user)}
