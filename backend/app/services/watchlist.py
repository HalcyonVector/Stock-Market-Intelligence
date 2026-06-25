"""
Watchlist persistence + enrichment.

CRUD is scoped to the authenticated user_id (ownership enforced on every read and
mutation). GET enriches items with live quotes from the provider layer so the UI
can render a ready-to-display watchlist in one call.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.adapters.registry import providers
from app.models.entities import Watchlist, WatchlistItem


async def list_watchlists(db: AsyncSession, user_id: str) -> list[Watchlist]:
    res = await db.execute(
        select(Watchlist).where(Watchlist.user_id == user_id)
        .options(selectinload(Watchlist.items))
    )
    return list(res.scalars().all())


async def _owned(db: AsyncSession, user_id: str, watchlist_id: int) -> Watchlist:
    res = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id, Watchlist.user_id == user_id
        ).options(selectinload(Watchlist.items)).execution_options(populate_existing=True)
    )
    wl = res.scalar_one_or_none()
    if wl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Watchlist not found")
    return wl


async def create_watchlist(db: AsyncSession, user_id: str, name: str) -> Watchlist:
    wl = Watchlist(user_id=user_id, name=name)
    db.add(wl)
    await db.commit()
    await db.refresh(wl, attribute_names=["items"])
    return wl


async def delete_watchlist(db: AsyncSession, user_id: str, watchlist_id: int) -> None:
    wl = await _owned(db, user_id, watchlist_id)
    await db.delete(wl)
    await db.commit()


async def add_item(db: AsyncSession, user_id: str, watchlist_id: int, symbol: str) -> Watchlist:
    wl = await _owned(db, user_id, watchlist_id)
    symbol = symbol.upper()
    if not any(i.symbol == symbol for i in wl.items):
        wl.items.append(WatchlistItem(symbol=symbol))
        await db.commit()
        await db.refresh(wl, attribute_names=["items"])
    return wl


async def remove_item(db: AsyncSession, user_id: str, watchlist_id: int, symbol: str) -> Watchlist:
    wl = await _owned(db, user_id, watchlist_id)
    for i in list(wl.items):
        if i.symbol == symbol.upper():
            wl.items.remove(i)
    await db.commit()
    await db.refresh(wl, attribute_names=["items"])
    return wl


async def with_quotes(db: AsyncSession, user_id: str, watchlist_id: int) -> dict:
    wl = await _owned(db, user_id, watchlist_id)
    symbols = [i.symbol for i in wl.items]
    quotes = await providers.market.quotes(symbols) if symbols else []
    return {
        "id": wl.id,
        "name": wl.name,
        "items": [{"id": i.id, "symbol": i.symbol} for i in wl.items],
        "quotes": [q.__dict__ for q in quotes],
    }
