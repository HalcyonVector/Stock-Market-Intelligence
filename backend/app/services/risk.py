"""
Risk profile for one stock: how its last year compares with its market's
benchmark and with the median stock in its sector.

Uses the daily history the sync job stores (no extra API calls): the stock,
SPY or the Nifty 50 as benchmark, and the weekly Market Study's per-stock
rows for the sector median.
"""
from __future__ import annotations

import math
import statistics

from app.adapters.history_store import is_indian
from app.adapters.registry import providers
from app.services.heatmap import SECTOR_MAP

LOOKBACK = 365
MIN_BARS = 60


def stats(closes: list[float]) -> dict:
    """1-year return, annualised volatility and maximum drawdown (percent)."""
    rets = [b / a - 1 for a, b in zip(closes, closes[1:]) if a]
    peak, worst = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        worst = min(worst, c / peak - 1)
    return {
        "return_pct": round((closes[-1] / closes[0] - 1) * 100, 1),
        "volatility_pct": round(statistics.pstdev(rets) * math.sqrt(252) * 100, 1) if len(rets) > 1 else None,
        "max_drawdown_pct": round(worst * 100, 1),
    }


def beta_corr(stock: dict[str, float], bench: dict[str, float]) -> tuple[float | None, float | None]:
    """Beta and correlation of daily returns on dates both traded."""
    days = sorted(set(stock) & set(bench))
    pairs = []
    for a, b in zip(days, days[1:]):
        if stock[a] and bench[a]:
            pairs.append((stock[b] / stock[a] - 1, bench[b] / bench[a] - 1))
    if len(pairs) < 30:
        return None, None
    xs = [p[1] for p in pairs]
    ys = [p[0] for p in pairs]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    cov = sum((x - mx) * (y - my) for x, y in pairs) / len(pairs)
    vx = sum((x - mx) ** 2 for x in xs) / len(xs)
    vy = sum((y - my) ** 2 for y in ys) / len(ys)
    if not vx or not vy:
        return None, None
    return round(cov / vx, 2), round(cov / math.sqrt(vx * vy), 2)


async def _closes(symbol: str) -> dict[str, float]:
    try:
        candles = await providers.market.candles(symbol, "1d", LOOKBACK)
    except Exception:  # noqa: BLE001
        return {}
    return {c.ts.date().isoformat(): c.close for c in candles if c.close}


async def profile(symbol: str) -> dict | None:
    symbol = symbol.upper()
    indian = is_indian(symbol)
    bench_sym, bench_name = ("^NSEI", "Nifty 50") if indian else ("SPY", "S&P 500 (SPY)")
    stock = await _closes(symbol)
    if len(stock) < MIN_BARS:
        return None
    bench = await _closes(bench_sym)
    s_closes = [stock[d] for d in sorted(stock)]
    out = {
        "symbol": symbol,
        "window": [min(stock), max(stock)],
        "stock": stats(s_closes),
        "benchmark": None,
        "benchmark_name": bench_name,
        "sector": SECTOR_MAP.get(symbol.removesuffix(".NS")),
        "sector_median": None,
    }
    if len(bench) >= MIN_BARS:
        # Benchmark over the same dates as the stock, so the comparison is fair.
        common = [d for d in sorted(bench) if min(stock) <= d <= max(stock)]
        if len(common) >= MIN_BARS:
            out["benchmark"] = stats([bench[d] for d in common])
        out["beta"], out["correlation"] = beta_corr(stock, bench)

    from app.services.study import get_study

    study = await get_study()
    if study and out["sector"]:
        market = "IN" if indian else "US"
        peers = [s for s in study.get("stocks", []) if s["sector"] == out["sector"] and s["market"] == market]
        if len(peers) >= 3:
            out["sector_median"] = {
                k: round(statistics.median(p[k] for p in peers), 1)
                for k in ("return_pct", "volatility_pct", "max_drawdown_pct")
            }
            out["sector_peers"] = len(peers)
    return out
