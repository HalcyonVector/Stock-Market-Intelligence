"""Watchlist endpoints (Phase 3). All scoped to the authenticated user."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_session
from app.schemas.watchlist import ItemCreate, WatchlistCreate
from app.services import watchlist as svc

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


def _out(wl) -> dict:
    return {"id": wl.id, "name": wl.name,
            "items": [{"id": i.id, "symbol": i.symbol} for i in wl.items]}


@router.get("")
async def list_all(user: str = Depends(get_current_user),
                   db: AsyncSession = Depends(get_session)):
    return {"data": [_out(w) for w in await svc.list_watchlists(db, user)]}


@router.post("", status_code=201)
async def create(body: WatchlistCreate, user: str = Depends(get_current_user),
                 db: AsyncSession = Depends(get_session)):
    return {"data": _out(await svc.create_watchlist(db, user, body.name))}


@router.delete("/{watchlist_id}", status_code=204)
async def delete(watchlist_id: int, user: str = Depends(get_current_user),
                 db: AsyncSession = Depends(get_session)):
    await svc.delete_watchlist(db, user, watchlist_id)


@router.get("/{watchlist_id}")
async def get_one(watchlist_id: int, user: str = Depends(get_current_user),
                  db: AsyncSession = Depends(get_session)):
    return {"data": await svc.with_quotes(db, user, watchlist_id)}


@router.post("/{watchlist_id}/items")
async def add_item(watchlist_id: int, body: ItemCreate,
                   user: str = Depends(get_current_user),
                   db: AsyncSession = Depends(get_session)):
    return {"data": _out(await svc.add_item(db, user, watchlist_id, body.symbol))}


@router.delete("/{watchlist_id}/items/{symbol}")
async def remove_item(watchlist_id: int, symbol: str,
                      user: str = Depends(get_current_user),
                      db: AsyncSession = Depends(get_session)):
    return {"data": _out(await svc.remove_item(db, user, watchlist_id, symbol))}
