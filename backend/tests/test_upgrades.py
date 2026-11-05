"""Shared quote cache, volume fill, sample-data tagging, events, search, push."""
import asyncio
import json
import time
from datetime import date, datetime, timedelta, timezone

from app.adapters import fallback as fb
from app.adapters import history_store
from app.adapters.base import Candle, Quote
from app.adapters.mock import MockMarketProvider


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _snap(closes, vols):
    end = datetime.now(timezone.utc)
    bars = [Candle(ts=end - timedelta(days=len(closes) - i), open=c, high=c, low=c, close=c, volume=v)
            for i, (c, v) in enumerate(zip(closes, vols))]
    return history_store.encode(bars)


def _provider(monkeypatch, store, chain):
    monkeypatch.setattr(fb, "_build_market_chain", lambda: chain)
    p = fb.FallbackMarketProvider()

    async def get(key):
        return store.get(key)

    async def put(key, value, ttl):
        store[key] = value

    monkeypatch.setattr(p, "_cache_get", get)
    monkeypatch.setattr(p, "_cache_set", put)
    return p


class _FinnhubNoVolume:
    name = "finnhub"
    calls = 0

    async def quote(self, s):
        _FinnhubNoVolume.calls += 1
        return Quote(symbol=s, price=50.0, change=1.0, change_pct=2.0, volume=0, avg_volume=0,
                     market_cap=None, currency="USD", market="US", ts=datetime.now(timezone.utc))


class _Boom:
    name = "boom"

    async def quote(self, s):
        raise AssertionError("should have been served from the shared quote blob")


def test_volume_filled_from_history_and_shared_blob_reused(monkeypatch):
    monkeypatch.setattr(fb, "_bulk", {"read_at": -1e9, "written_at": -1e9, "dirty": False, "data": {}})
    store = {history_store.KEY.format(symbol="VOLFILL"): _snap([10.0] * 22, [100] * 21 + [400])}
    p = _provider(monkeypatch, store, [_FinnhubNoVolume()])
    out = _run(p.quotes(["VOLFILL"]))
    q = out[0]
    assert q.volume == 400 and q.avg_volume == 100 and q.source == "live"
    blob = json.loads(store[fb.BULK_KEY])
    assert "VOLFILL" in blob

    # A fresh process (empty memory) reads the one shared key instead of
    # calling a provider again.
    monkeypatch.setattr(fb, "_bulk", {"read_at": -1e9, "written_at": -1e9, "dirty": False, "data": {}})
    fb._local_cache.clear()
    p2 = _provider(monkeypatch, store, [_Boom()])
    q2 = _run(p2.quote("VOLFILL"))
    assert q2.price == 50.0 and q2.volume == 400


def test_stale_blob_entries_are_ignored(monkeypatch):
    old = time.time() - fb.QUOTE_TTL - 5
    q = {"symbol": "OLDQ", "price": 1.0, "change": 0, "change_pct": 0, "volume": 1, "avg_volume": 1,
         "market_cap": None, "currency": "USD", "market": "US",
         "ts": datetime.now(timezone.utc).isoformat(), "source": "live"}
    monkeypatch.setattr(fb, "_bulk", {"read_at": -1e9, "written_at": -1e9, "dirty": False,
                                      "data": {"OLDQ": {"at": old, "q": q}}})
    p = _provider(monkeypatch, {}, [_FinnhubNoVolume()])
    assert p._bulk_get("OLDQ") is None


def test_sources_are_tagged():
    assert _run(MockMarketProvider().quote("AAPL")).source == "mock"
    q = history_store.latest_quote(_snap([1.0, 2.0], [5, 5]), "AAPL")
    assert q.source == "eod"


def test_health_reports_recent_sample_data(monkeypatch):
    from app.api.routes import health

    monkeypatch.setattr(health.settings, "DATA_MODE", "live")
    assert health._mock_recent(None) is False
    assert health._mock_recent(datetime.now(timezone.utc).isoformat()) is True
    assert health._mock_recent((datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()) is False


# ---------------------------------------------------------------- events
def test_events_upcoming_only_and_sorted(monkeypatch):
    from app.services import events

    monkeypatch.setattr(events, "_cache", {"at": time.monotonic(), "updated": "x", "data": {
        "AAPL": {"earnings": "2026-11-20", "ex_dividend": "2026-11-10", "dividend": "2026-10-01", "eps_estimate": 2.9},
        "TCS": {"earnings": "2027-06-01"},
    }})
    out = _run(events.for_symbols(["aapl", "TCS", "NOPE"], 90, today=date(2026, 11, 5)))["events"]
    assert [(e["symbol"], e["type"]) for e in out] == [("AAPL", "ex_dividend"), ("AAPL", "earnings")]
    assert out[1]["eps_estimate"] == 2.9 and out[0]["days_until"] == 5


# ---------------------------------------------------------------- search
def test_search_matches_universe_without_finnhub(monkeypatch):
    from app.services import symbols

    monkeypatch.setattr(symbols.settings, "FINNHUB_API_KEY", "")
    rows = _run(symbols.search("reli"))
    assert rows[0]["symbol"] == "RELIANCE" and rows[0]["market"] == "IN" and rows[0]["tracked"]
    assert symbols.is_valid("IRCTC.NS") and symbols.is_valid("BRK-B")
    assert not symbols.is_valid("DROP TABLE") and not symbols.is_valid("AAPL.L")


class _FakeRedis:
    def __init__(self):
        self.s = set()

    async def sismember(self, k, v):
        return v in self.s

    async def scard(self, k):
        return len(self.s)

    async def sadd(self, k, v):
        self.s.add(v)


def test_register_extra_skips_tracked_and_caps(monkeypatch):
    from app.services import symbols

    r = _FakeRedis()
    monkeypatch.setattr(symbols, "get_redis", lambda: r)
    monkeypatch.setattr(symbols, "_registered", set())
    _run(symbols.register_extra("AAPL"))        # tracked: nothing to do
    _run(symbols.register_extra("irctc.ns"))
    assert r.s == {"IRCTC.NS"}
    monkeypatch.setattr(symbols, "MAX_EXTRA", 1)
    _run(symbols.register_extra("ZOMATO.NS"))
    assert r.s == {"IRCTC.NS"}


# ---------------------------------------------------------------- push
def test_push_messages_and_validation():
    from app.services import push

    title, body = push.describe_alert({"symbol": "AAPL", "condition": "above", "threshold": 200,
                                       "trigger_price": 201.5, "trigger_change_pct": 1.2, "note": ""})
    assert title == "AAPL rose above 200" and body == "Now 201.50 (+1.20%)"
    assert push._valid({"endpoint": "https://fcm.googleapis.com/x", "keys": {"p256dh": "a", "auth": "b"}})
    assert not push._valid({"endpoint": "http://evil", "keys": {"p256dh": "a", "auth": "b"}})


def test_push_disabled_without_keys(monkeypatch):
    from app.services import push

    monkeypatch.setattr(push.settings, "VAPID_PUBLIC_KEY", "")
    assert _run(push.notify("u", "t", "b")) == 0
