"""Paper trading against an in-memory SQLite DB with a fake quote provider."""
import asyncio

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.adapters.base import Quote
from app.adapters.registry import providers
from app.db.session import get_session
from app.main import app
from app.models.entities import Base


def _run(coro):
    # A fresh loop each time: earlier tests may have closed the default loop,
    # which makes asyncio.get_event_loop() raise on Python 3.12+.
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
)
TestSession = async_sessionmaker(engine, expire_on_commit=False)

PRICES = {"AAPL": 100.0, "TCS.NS": 4000.0}


class FakeMarket:
    def _q(self, s):
        return Quote(symbol=s, price=PRICES[s], change=0, change_pct=1.5, volume=1, avg_volume=1,
                     market_cap=None, currency="INR" if s.endswith(".NS") else "USD",
                     market="IN" if s.endswith(".NS") else "US", ts=datetime.now(timezone.utc))

    async def quote(self, s):
        if s not in PRICES:
            raise RuntimeError("no data")
        return self._q(s)

    async def quotes(self, syms):
        return [self._q(s) for s in syms if s in PRICES]


async def _override():
    async with TestSession() as s:
        yield s


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    _run(init())
    prev = app.dependency_overrides.get(get_session)
    app.dependency_overrides[get_session] = _override
    monkeypatch.setattr(providers, "market", FakeMarket())
    yield
    if prev is None:
        app.dependency_overrides.pop(get_session, None)
    else:
        app.dependency_overrides[get_session] = prev


client = TestClient(app)
H = {"X-User-Id": "trader"}


def test_fresh_account_is_read_only_default():
    d = client.get("/api/v1/paper", headers=H).json()["data"]
    assert d["accounts"]["USD"]["cash"] == 100_000
    assert d["accounts"]["INR"]["cash"] == 1_000_000
    assert d["positions"] == [] and d["trades"] == []


def test_buy_then_sell_tracks_cash_positions_and_pnl():
    r = client.post("/api/v1/paper/orders", json={"symbol": "aapl", "side": "buy", "quantity": 10}, headers=H)
    assert r.status_code == 201
    d = client.get("/api/v1/paper", headers=H).json()["data"]
    assert d["accounts"]["USD"]["cash"] == 99_000
    assert d["positions"][0]["symbol"] == "AAPL" and d["positions"][0]["quantity"] == 10

    PRICES["AAPL"] = 110.0
    try:
        r = client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "sell", "quantity": 4}, headers=H)
        assert r.json()["data"]["realized_pnl"] == 40.0
        d = client.get("/api/v1/paper", headers=H).json()["data"]
        assert d["accounts"]["USD"]["cash"] == 99_440
        pos = d["positions"][0]
        assert pos["quantity"] == 6 and pos["unrealized_pnl"] == 60.0
        assert [t["side"] for t in d["trades"]] == ["sell", "buy"]
    finally:
        PRICES["AAPL"] = 100.0


def test_inr_stocks_use_inr_cash():
    client.post("/api/v1/paper/orders", json={"symbol": "TCS.NS", "side": "buy", "quantity": 2}, headers=H)
    d = client.get("/api/v1/paper", headers=H).json()["data"]
    assert d["accounts"]["INR"]["cash"] == 992_000
    assert d["accounts"]["USD"]["cash"] == 100_000


def test_rejects_overspend_oversell_and_unknown_symbol():
    r = client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "buy", "quantity": 2000}, headers=H)
    assert r.status_code == 400 and "Not enough" in r.json()["detail"]
    r = client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "sell", "quantity": 1}, headers=H)
    assert r.status_code == 400
    r = client.post("/api/v1/paper/orders", json={"symbol": "ZZZZ", "side": "buy", "quantity": 1}, headers=H)
    assert r.status_code == 502
    r = client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "buy", "quantity": -1}, headers=H)
    assert r.status_code == 422


def test_accounts_are_isolated_and_reset_works():
    client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "buy", "quantity": 1}, headers=H)
    other = client.get("/api/v1/paper", headers={"X-User-Id": "someone-else"}).json()["data"]
    assert other["positions"] == []
    d = client.post("/api/v1/paper/reset", headers=H).json()["data"]
    assert d["positions"] == [] and d["accounts"]["USD"]["cash"] == 100_000


def test_history_rebuilds_equity_and_benchmark(monkeypatch):
    from datetime import timedelta

    from app.adapters.base import Candle

    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(5, -1, -1)]
    series = {
        "AAPL": [100, 100, 110, 120, 120, 130],
        "SPY": [500, 500, 505, 510, 515, 520],
    }

    class WithCandles(FakeMarket):
        async def candles(self, s, interval, lookback):
            return [Candle(ts=datetime(d.year, d.month, d.day, tzinfo=timezone.utc),
                           open=c, high=c, low=c, close=c, volume=1)
                    for d, c in zip(days, series.get(s, []))]

    monkeypatch.setattr(providers, "market", WithCandles())
    client.post("/api/v1/paper/orders", json={"symbol": "AAPL", "side": "buy", "quantity": 10}, headers=H)

    # Pretend the buy happened three days ago at 100.
    from sqlalchemy import update
    from app.models.entities import PaperTrade

    async def backdate():
        async with TestSession() as s:
            await s.execute(update(PaperTrade).values(
                ts=datetime.combine(days[2], datetime.min.time()).replace(hour=12)))
            await s.commit()
    _run(backdate())

    d = client.get("/api/v1/paper/history", headers=H).json()["data"]["curves"]["USD"]
    pts = {p["date"]: p for p in d["points"]}
    # Before the trade: just the starting cash.
    assert pts[days[1].isoformat()]["equity"] == 100_000
    # After: 99,000 cash + 10 shares at each day's close.
    assert pts[days[3].isoformat()]["equity"] == 99_000 + 10 * 120
    assert pts[days[5].isoformat()]["equity"] == 99_000 + 10 * 130
    assert d["benchmark"] == "S&P 500 (SPY)"
    assert pts[days[5].isoformat()]["benchmark"] > d["points"][0]["benchmark"]
    assert "INR" not in client.get("/api/v1/paper/history", headers=H).json()["data"]["curves"]


@pytest.fixture(scope="module", autouse=True)
def _dispose_engine():
    # aiosqlite runs each connection on a non-daemon thread; without disposing
    # the engine the pytest process finishes the tests but never exits.
    yield
    _run(engine.dispose())
