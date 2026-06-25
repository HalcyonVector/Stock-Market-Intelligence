"""
Tests for the portfolio optimization engine (network-free).

Pure risk-metric and optimizer helpers are tested with synthetic return series;
the full ``analyze`` suite is run once against a fake provider to confirm the
end-to-end shape (optimization → frontier → Monte Carlo → stress → backtest).
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import numpy as np

from app.services import portfolio as pf
from app.services.portfolio import (
    _calmar,
    _compute_risk_metrics,
    _cvar,
    _hierarchical_risk_parity,
    _max_drawdown,
    _monte_carlo_cloud,
    _optimize,
    _portfolio_return,
    _portfolio_vol,
    _sortino,
    _trace_efficient_frontier,
)


def _returns_matrix(T=252, n=5, seed=1):
    rng = np.random.default_rng(seed)
    # Small positive drift, distinct vols, mild correlation via a common factor.
    factor = rng.standard_normal((T, 1)) * 0.01
    idio = rng.standard_normal((T, n)) * np.linspace(0.008, 0.02, n)
    return factor + idio + 0.0005


# --------------------------------------------------------------------------- #
# Scalar risk metrics
# --------------------------------------------------------------------------- #
def test_max_drawdown_known_path():
    cumulative = np.array([1.0, 1.2, 0.9, 1.5])
    assert abs(_max_drawdown(cumulative) - (-0.25)) < 1e-9


def test_calmar_ratio():
    assert abs(_calmar(0.2, -0.1) - 2.0) < 1e-9
    assert _calmar(0.2, 0.0) == 0.0  # guarded against zero drawdown


def test_cvar_is_positive_for_losses():
    rng = np.random.default_rng(0)
    rets = rng.standard_normal(1000) * 0.01
    cv = _cvar(rets, 0.05)
    assert cv > 0  # expected shortfall reported as a positive loss magnitude


def test_sortino_finite_and_signed():
    rets = _returns_matrix(n=1)[:, 0]
    s = _sortino(rets)
    assert np.isfinite(s)


def test_portfolio_return_and_vol_consistency():
    rmat = _returns_matrix()
    mean_ret = rmat.mean(axis=0)
    cov = np.cov(rmat, rowvar=False)
    w = np.ones(len(mean_ret)) / len(mean_ret)
    assert np.isfinite(_portfolio_return(w, mean_ret))
    assert _portfolio_vol(w, cov) > 0


def test_compute_risk_metrics_keys():
    rets = _returns_matrix(n=1)[:, 0]
    m = _compute_risk_metrics(rets)
    for key in ("annual_return", "annual_volatility", "sharpe", "sortino",
                "max_drawdown", "calmar", "positive_days_pct"):
        assert key in m
    assert 0 <= m["positive_days_pct"] <= 100
    assert m["max_drawdown"] <= 0


# --------------------------------------------------------------------------- #
# Optimizers
# --------------------------------------------------------------------------- #
def test_optimize_weights_are_a_simplex():
    rmat = _returns_matrix()
    mean_ret = rmat.mean(axis=0)
    cov = np.cov(rmat, rowvar=False)
    for objective in ("max_sharpe", "min_variance", "risk_parity"):
        w = _optimize(objective, mean_ret, cov)
        assert len(w) == len(mean_ret)
        assert abs(w.sum() - 1.0) < 1e-6
        assert (w >= -1e-9).all() and (w <= 0.4 + 1e-6).all()


def test_min_variance_not_riskier_than_equal_weight():
    rmat = _returns_matrix(seed=3)
    mean_ret = rmat.mean(axis=0)
    cov = np.cov(rmat, rowvar=False)
    mv = _optimize("min_variance", mean_ret, cov)
    eq = np.ones(len(mean_ret)) / len(mean_ret)
    assert _portfolio_vol(mv, cov) <= _portfolio_vol(eq, cov) + 1e-9


def test_hrp_weights_sum_to_one():
    rmat = _returns_matrix()
    cov = np.cov(rmat, rowvar=False)
    w = _hierarchical_risk_parity(cov, cov.shape[0])
    assert abs(w.sum() - 1.0) < 1e-9
    assert (w > 0).all()


def test_monte_carlo_cloud_shape():
    rmat = _returns_matrix()
    mean_ret = rmat.mean(axis=0)
    cov = np.cov(rmat, rowvar=False)
    cloud = _monte_carlo_cloud(mean_ret, cov, n_portfolios=200)
    assert len(cloud["returns"]) == len(cloud["risks"]) == len(cloud["sharpes"]) == 200


def test_efficient_frontier_traces_points():
    rmat = _returns_matrix()
    mean_ret = rmat.mean(axis=0)
    cov = np.cov(rmat, rowvar=False)
    frontier = _trace_efficient_frontier(mean_ret, cov, n_points=20)
    assert len(frontier["risks"]) > 0
    assert len(frontier["returns"]) == len(frontier["risks"])


# --------------------------------------------------------------------------- #
# analyze — integration with faked provider
# --------------------------------------------------------------------------- #
class _FakeMarket:
    def __init__(self, seed=11):
        self._rng = np.random.default_rng(seed)

    async def candles(self, symbol, interval, lookback):
        # Deterministic per-symbol random walk of `lookback` closes.
        rng = np.random.default_rng(abs(hash(symbol)) % (2**32))
        rets = rng.standard_normal(lookback) * 0.015 + 0.0006
        prices = 100 * np.exp(np.cumsum(rets))
        return [SimpleNamespace(ts=f"2025-01-{(i % 28) + 1:02d}", open=p, high=p * 1.01,
                                low=p * 0.99, close=float(p), volume=1_000_000)
                for i, p in enumerate(prices)]


class _FakeRedis:
    async def get(self, *a, **k):
        return None

    async def set(self, *a, **k):
        return None


def test_analyze_end_to_end(monkeypatch):
    monkeypatch.setattr(pf, "providers", SimpleNamespace(market=_FakeMarket()))
    monkeypatch.setattr(pf, "get_redis", lambda: _FakeRedis())

    out = asyncio.run(pf.analyze(["AAPL", "MSFT", "GOOGL", "AMZN"]))
    assert out["n_assets"] == 4
    for section in ("strategies", "profiles", "frontier", "monte_carlo",
                    "stress_tests", "correlation", "assets"):
        assert section in out
    # Every strategy's weights form a simplex.
    for strat in out["strategies"].values():
        assert abs(sum(strat["weights"]) - 1.0) < 1e-6
    # Correlation matrix is square in the number of assets.
    assert len(out["correlation"]["matrix"]) == 4
    assert len(out["stress_tests"]) == 6


def test_analyze_insufficient_assets(monkeypatch):
    class _Empty:
        async def candles(self, *a, **k):
            return []

    monkeypatch.setattr(pf, "providers", SimpleNamespace(market=_Empty()))
    monkeypatch.setattr(pf, "get_redis", lambda: _FakeRedis())
    out = asyncio.run(pf.analyze(["AAPL", "MSFT", "GOOGL"]))
    assert "error" in out
