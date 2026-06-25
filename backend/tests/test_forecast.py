"""
Tests for the price-forecast service (network-free).

Pure model helpers are tested directly. ``forecast_price`` is driven via
``asyncio.run`` with a fake provider + no-op Redis. Both the SARIMA primary path
and the linear+Holt fallback path are exercised; the SARIMA assertions are
skipped automatically if statsmodels is not installed.
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pytest

from app.services import forecast as fc
from app.services.forecast import (
    _exp_smoothing_forecast,
    _linear_forecast,
    _sarima_forecast,
    forecast_price,
)


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
def _series(n=200, start=100.0, drift=0.0008, noise=0.0):
    rng = np.random.default_rng(7)
    steps = drift + (noise * rng.standard_normal(n) if noise else 0.0)
    return start * np.exp(np.cumsum(steps))


def _candles(prices):
    d0 = date(2025, 1, 1)
    out = []
    for i, p in enumerate(prices):
        ts = (d0 + timedelta(days=i)).strftime("%Y-%m-%d")
        out.append(SimpleNamespace(ts=ts, open=p, high=p * 1.01, low=p * 0.99,
                                   close=float(p), volume=1_000_000))
    return out


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


def _patch_io(monkeypatch, candles):
    monkeypatch.setattr(fc, "providers", SimpleNamespace(market=_FakeMarket(candles)))
    monkeypatch.setattr(fc, "get_redis", lambda: _FakeRedis())


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #
def test_linear_forecast_perfect_loglinear():
    # closes = exp(linear) → R² should be essentially 1 and bands ordered.
    closes = np.exp(0.01 * np.arange(120) + 4)
    out = _linear_forecast(closes, 30)
    assert len(out["forecast"]) == 30
    assert out["r_squared"] > 0.999
    assert out["upper_95"][0] >= out["forecast"][0] >= out["lower_95"][0]


def test_exp_smoothing_forecast_shape():
    closes = _series(150)
    out = _exp_smoothing_forecast(closes, 20)
    assert len(out["forecast"]) == 20
    assert len(out["upper_95"]) == 20 and len(out["lower_95"]) == 20
    assert out["rmse"] >= 0


def test_sarima_forecast_optional():
    pytest.importorskip("statsmodels")
    closes = _series(200, noise=0.01)
    out = _sarima_forecast(closes, 30)
    assert out is not None
    assert len(out["forecast"]) == 30
    assert out["order"] == [1, 1, 1]
    # 95% band is at least as wide as the 80% band at every step.
    for u95, u80, l80, l95 in zip(out["upper_95"], out["upper_80"],
                                  out["lower_80"], out["lower_95"]):
        assert u95 >= u80 >= l80 >= l95


# --------------------------------------------------------------------------- #
# forecast_price — integration
# --------------------------------------------------------------------------- #
def test_forecast_insufficient_data_errors(monkeypatch):
    _patch_io(monkeypatch, _candles(_series(40)))
    out = asyncio.run(forecast_price("AAPL", 30))
    assert "error" in out


def test_forecast_fallback_path(monkeypatch):
    # Force the SARIMA path off → linear+Holt ensemble must take over cleanly.
    _patch_io(monkeypatch, _candles(_series(200)))
    monkeypatch.setattr(fc, "_sarima_forecast", lambda *a, **k: None)

    out = asyncio.run(forecast_price("AAPL", 30))
    assert out["symbol"] == "AAPL"
    assert len(out["chart_data"]) > 30
    assert "fallback" in out["method"].lower()
    assert "exp_smoothing" in out["models"]
    assert "linear" in out["models"]
    # Forecast block carries both CI bands.
    fcast_pts = [p for p in out["chart_data"] if "forecast" in p]
    assert len(fcast_pts) == 30
    assert all("upper_95" in p and "lower_80" in p for p in fcast_pts)


def test_forecast_sarima_path(monkeypatch):
    pytest.importorskip("statsmodels")
    _patch_io(monkeypatch, _candles(_series(200, noise=0.01)))
    out = asyncio.run(forecast_price("AAPL", 30))
    assert "SARIMA" in out["method"]
    assert "sarima" in out["models"]
    assert out["models"]["sarima"]["aic"] is not None
    assert out["forecast_high"] >= out["forecast_low"]
