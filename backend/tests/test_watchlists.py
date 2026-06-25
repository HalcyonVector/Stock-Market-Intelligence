"""Watchlist CRUD against an in-memory SQLite DB (no Postgres needed)."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.session import get_session
from app.main import app
from app.models.entities import Base

# StaticPool keeps ONE connection so the in-memory DB persists across sessions.
engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
)
TestSession = async_sessionmaker(engine, expire_on_commit=False)


async def _init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


asyncio.get_event_loop().run_until_complete(_init())


async def _override():
    async with TestSession() as s:
        yield s


app.dependency_overrides[get_session] = _override
client = TestClient(app)
H = {"X-User-Id": "tester"}


def test_watchlist_lifecycle():
    # create
    wl = client.post("/api/v1/watchlists", json={"name": "Tech"}, headers=H).json()["data"]
    wid = wl["id"]
    assert wl["name"] == "Tech"

    # add items
    r = client.post(f"/api/v1/watchlists/{wid}/items", json={"symbol": "aapl"}, headers=H)
    data = r.json()["data"]
    assert data["items"][0]["symbol"] == "AAPL"      # normalised upper-case

    # list scoped to user
    lst = client.get("/api/v1/watchlists", headers=H).json()["data"]
    assert any(w["id"] == wid for w in lst)

    # enriched with quotes
    full = client.get(f"/api/v1/watchlists/{wid}", headers=H).json()["data"]
    assert len(full["quotes"]) == 1

    # remove + delete
    client.delete(f"/api/v1/watchlists/{wid}/items/AAPL", headers=H)
    after = client.get(f"/api/v1/watchlists/{wid}", headers=H).json()["data"]
    assert after["items"] == []
    assert client.delete(f"/api/v1/watchlists/{wid}", headers=H).status_code == 204


def test_other_user_cannot_see():
    wl = client.post("/api/v1/watchlists", json={"name": "Private"}, headers=H).json()["data"]
    r = client.get(f"/api/v1/watchlists/{wl['id']}", headers={"X-User-Id": "intruder"})
    assert r.status_code == 404
