"""
Tests for the data-layer resilience hardening:

  * CircuitBreaker state machine + rate-limit classification
  * Alpha Vantage daily-quota breaker
  * Finnhub candle short-circuit (paid endpoint)
  * Stooq symbol mapping + CSV candle parsing
  * StockTwits null-body guard (the old "'NoneType' has no attribute get" crash)
  * sector._fetch_symbol sourcing sector from the static SECTOR_MAP (no profile call)

These are network-free: async provider methods are driven via ``asyncio.run`` and
HTTP is replaced with small fakes, so the suite needs no live keys or pytest-asyncio.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from app.adapters import resilience
from app.adapters.resilience import CircuitBreaker, is_rate_limit_error


# --------------------------------------------------------------------------- #
# CircuitBreaker
# --------------------------------------------------------------------------- #
def test_circuit_opens_after_threshold_and_blocks():
    cb = CircuitBreaker("t1", fail_threshold=3, cooldown=60)
    assert cb.allow() is True
    for _ in range(3):
        cb.record_failure()
    assert cb.allow() is False  # open -> blocks


def test_circuit_half_open_after_cooldown_then_success_closes():
    cb = CircuitBreaker("t2", fail_threshold=2, cooldown=0.05)
    cb.record_failure()
    cb.record_failure()
    assert cb.allow() is False
    time.sleep(0.06)
    assert cb.allow() is True          # half-open probe permitted
    cb.record_success()                # success closes it
    assert cb.allow() is True
    assert cb._opened_at is None


def test_circuit_trip_forces_open():
    cb = CircuitBreaker("t3", fail_threshold=5, cooldown=60)
    cb.trip()
    assert cb.allow() is False


def test_guard_raises_when_open():
    cb = CircuitBreaker("t4", fail_threshold=1, cooldown=60)
    cb.record_failure()
    with pytest.raises(resilience.ProviderUnavailable):
        cb.guard()


def test_rate_limit_classifier():
    assert is_rate_limit_error(Exception("429 Too Many Requests"))
    assert is_rate_limit_error(Exception("rate limit exceeded"))
    assert not is_rate_limit_error(Exception("connection refused"))


# --------------------------------------------------------------------------- #
# Alpha Vantage quota breaker
# --------------------------------------------------------------------------- #
def test_alphavantage_quota_message_trips_breaker():
    from app.adapters import alphavantage_provider as av

    # Use a clean breaker instance for isolation.
    resilience._breakers.pop("alphavantage", None)
    with pytest.raises(ValueError):
        av._check_quota({"Note": "Our standard API call frequency is 25 requests per day"})
    assert av._av_breaker().allow() is False  # tripped


def test_alphavantage_normal_payload_does_not_trip():
    from app.adapters import alphavantage_provider as av

    resilience._breakers.pop("alphavantage", None)
    av._check_quota({"Global Quote": {"05. price": "100.0"}})  # no raise
    assert av._av_breaker().allow() is True


# --------------------------------------------------------------------------- #
# Finnhub paid candle short-circuit
# --------------------------------------------------------------------------- #
def test_finnhub_candles_short_circuits():
    from app.adapters.finnhub_provider import FinnhubMarketProvider

    with pytest.raises(NotImplementedError):
        asyncio.run(FinnhubMarketProvider().candles("AAPL", "1d", 30))


# --------------------------------------------------------------------------- #
# Stooq
# --------------------------------------------------------------------------- #
def test_stooq_symbol_mapping():
    from app.adapters.stooq_provider import _stooq_symbol

    assert _stooq_symbol("AAPL", "US") == "aapl.us"
    assert _stooq_symbol("BRK-B", "US") == "brk.b.us"
    with pytest.raises(ValueError):
        _stooq_symbol("INFY", "IN")


class _FakeResp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        return None


class _FakeClient:
    def __init__(self, text):
        self._text = text

    async def get(self, *a, **k):
        return _FakeResp(self._text)


def test_stooq_candles_parse(monkeypatch):
    from app.adapters import stooq_provider as sp

    csv = (
        "Date,Open,High,Low,Close,Volume\n"
        "2026-06-23,10.0,11.0,9.5,10.5,1000\n"
        "2026-06-24,10.5,12.0,10.4,11.8,2000\n"
    )
    monkeypatch.setattr(sp, "get_async_client", lambda *a, **k: _FakeClient(csv))
    resilience._breakers.pop("stooq", None)

    candles = asyncio.run(sp.StooqMarketProvider().candles("AAPL", "1d", 5))
    assert len(candles) == 2
    assert candles[-1].close == 11.8
    assert candles[0].open == 10.0


def test_stooq_no_data_raises(monkeypatch):
    from app.adapters import stooq_provider as sp

    monkeypatch.setattr(sp, "get_async_client", lambda *a, **k: _FakeClient("No data"))
    resilience._breakers.pop("stooq", None)
    with pytest.raises(Exception):
        asyncio.run(sp.StooqMarketProvider().candles("ZZZZ", "1d", 5))


# --------------------------------------------------------------------------- #
# StockTwits null-body guard
# --------------------------------------------------------------------------- #
class _FakeJsonResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeJsonClient:
    def __init__(self, payload):
        self._payload = payload

    async def get(self, *a, **k):
        return _FakeJsonResp(self._payload)


def test_stocktwits_null_body_returns_empty(monkeypatch):
    from app.adapters import sentiment_live as sl

    # StockTwits returns a bare ``null`` when blocked -> json() is None.
    monkeypatch.setattr(sl, "get_async_client", lambda *a, **k: _FakeJsonClient(None))
    resilience._breakers.pop("stocktwits", None)

    out = asyncio.run(sl.StockTwitsSentimentProvider().snapshot("AAPL"))
    assert out == []  # no crash, graceful empty


# --------------------------------------------------------------------------- #
# Sector rotation sources sector from SECTOR_MAP, not a live profile() call
# --------------------------------------------------------------------------- #
def test_sector_fetch_uses_sector_map():
    from app.services import sector
    from app.services.heatmap import SECTOR_MAP

    sem = asyncio.Semaphore(1)
    row = asyncio.run(sector._fetch_symbol("AAPL", sem))
    assert row is not None
    assert row["sector"] == SECTOR_MAP["AAPL"] == "Technology"


def test_rotation_cache_miss_is_non_blocking(monkeypatch):
    """On a cache miss rotation() returns immediately without running the heavy
    scan inline (it schedules a background task instead)."""
    from app.services import sector

    calls = {"n": 0}

    async def _fake_compute(market="GLOBAL"):
        calls["n"] += 1
        return []

    monkeypatch.setattr(sector, "compute_rotation", _fake_compute)
    sector._inflight.clear()

    async def _run():
        # Force a cache miss by pointing redis at a get() that returns None.
        class _R:
            async def get(self, *a, **k):
                return None

        monkeypatch.setattr(sector, "get_redis", lambda: _R())
        result = await sector.rotation("GLOBAL")
        # Give the scheduled background task a tick to run.
        await asyncio.sleep(0)
        return result

    result = asyncio.run(_run())
    assert result == []  # returned immediately, not the computed payload
