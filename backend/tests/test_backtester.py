"""
Tests for the strategy backtester (network-free).

Pure signal-generation and trade-simulation logic is tested directly; the public
``backtest_strategy`` coroutine is driven via ``asyncio.run`` with a fake provider
and a no-op Redis so no live data or cache is required.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import numpy as np

from app.services import backtester as bt
from app.services.backtester import _generate_signals, _simulate, list_strategies


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
def _candle(i, close):
    return SimpleNamespace(ts=f"2026-01-{(i % 28) + 1:02d}", open=close,
                           high=close * 1.01, low=close * 0.99,
                           close=close, volume=1_000_000)


def _synthetic_candles(n=180):
    # Trend + oscillation so RSI / crossovers actually fire.
    x = np.arange(n)
    prices = 100 + 0.05 * x + 8 * np.sin(x / 6.0)
    return [_candle(i, float(p)) for i, p in enumerate(prices)]


class _FakeMarket:
    def __init__(self, candles):
        self._candles = candles

    async def candles(self, symbol, interval, lookback):
        return self._candles[-lookback:]


class _FakeRedis:
    async def get(self, *a, **k):
        return None

    async def set(self, *a, **k):
        return None


# --------------------------------------------------------------------------- #
# list_strategies
# --------------------------------------------------------------------------- #
def test_list_strategies_shape():
    strats = list_strategies()
    ids = {s["id"] for s in strats}
    assert {"rsi_oversold", "macd_crossover", "sma_crossover", "bollinger_bounce"} <= ids
    for s in strats:
        assert s["name"] and "params" in s


# --------------------------------------------------------------------------- #
# _generate_signals
# --------------------------------------------------------------------------- #
def test_signals_are_valid_trichotomy():
    candles = _synthetic_candles()
    closes = np.array([c.close for c in candles])
    highs = np.array([c.high for c in candles])
    lows = np.array([c.low for c in candles])
    for strat in ("rsi_oversold", "macd_crossover", "sma_crossover", "bollinger_bounce"):
        params = bt.STRATEGIES[strat]["params"]
        sig = _generate_signals(strat, closes, highs, lows, params)
        assert len(sig) == len(closes)
        assert set(sig) <= {-1, 0, 1}
        assert any(v != 0 for v in sig), f"{strat} produced no signals"


# --------------------------------------------------------------------------- #
# _simulate
# --------------------------------------------------------------------------- #
def test_simulate_single_round_trip_profit():
    closes = np.array([100.0, 110.0])
    res = _simulate(closes, ["2026-01-01", "2026-01-02"], [1, -1], 10000)
    assert res["num_trades"] == 2          # one buy + one sell
    assert res["num_wins"] == 1
    assert res["win_rate"] == 100.0
    assert res["final_value"] == 11000.0
    assert res["total_return_pct"] == 10.0
    # Benchmark is buy-and-hold over the same window (also +10%).
    assert res["alpha"] == 0.0


def test_simulate_no_signals_stays_flat():
    closes = np.array([100.0, 101.0, 102.0])
    res = _simulate(closes, ["a", "b", "c"], [0, 0, 0], 10000)
    assert res["num_trades"] == 0
    assert res["final_value"] == 10000.0
    assert res["total_return_pct"] == 0.0


# --------------------------------------------------------------------------- #
# backtest_strategy (integration, faked I/O)
# --------------------------------------------------------------------------- #
def test_backtest_strategy_end_to_end(monkeypatch):
    candles = _synthetic_candles()
    monkeypatch.setattr(bt, "providers", SimpleNamespace(market=_FakeMarket(candles)))
    monkeypatch.setattr(bt, "get_redis", lambda: _FakeRedis())

    out = asyncio.run(bt.backtest_strategy("AAPL", "rsi_oversold"))
    assert out["symbol"] == "AAPL"
    assert out["strategy"] == "rsi_oversold"
    assert "equity_curve" in out and out["equity_curve"]
    assert out["num_trades"] >= 0
    assert 0 <= out["win_rate"] <= 100


def test_backtest_insufficient_data_returns_error(monkeypatch):
    monkeypatch.setattr(bt, "providers", SimpleNamespace(market=_FakeMarket(_synthetic_candles(10))))
    monkeypatch.setattr(bt, "get_redis", lambda: _FakeRedis())
    out = asyncio.run(bt.backtest_strategy("AAPL", "rsi_oversold"))
    assert "error" in out
