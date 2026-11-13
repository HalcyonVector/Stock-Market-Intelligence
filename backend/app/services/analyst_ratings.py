"""
Wall Street analyst consensus for tracked US stocks, from Finnhub's free
recommendation-trends endpoint (monthly counts of Strong Buy / Buy / Hold /
Sell / Strong Sell ratings).

These are real published analyst ratings, unlike the app's own discovery
scores. They change monthly, so the whole set refreshes at most once a day:
~100 Finnhub calls a day, spread over the free 60/minute limit.
"""
from __future__ import annotations

import asyncio

import httpx

from app.adapters.mock import _UNIVERSE, _seed
from app.core import snapshot
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("services.analyst_ratings")

BASE = "https://finnhub.io/api/v1"
TTL = 24 * 3600
KEY = "analyst_ratings:v1"
MIN_ANALYSTS = 3


def consensus(row: dict) -> dict | None:
    """Latest Finnhub period -> counts, a -2..+2 score and a label."""
    counts = {k: int(row.get(k) or 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")}
    n = sum(counts.values())
    if n < MIN_ANALYSTS:
        return None
    score = (2 * counts["strongBuy"] + counts["buy"] - counts["sell"] - 2 * counts["strongSell"]) / n
    label = ("Strong Buy" if score >= 1.5 else "Buy" if score >= 0.5
             else "Hold" if score > -0.5 else "Sell" if score > -1.5 else "Strong Sell")
    return {
        "analysts": n,
        "strong_buy": counts["strongBuy"], "buy": counts["buy"], "hold": counts["hold"],
        "sell": counts["sell"], "strong_sell": counts["strongSell"],
        "buy_pct": round((counts["strongBuy"] + counts["buy"]) / n * 100),
        "sell_pct": round((counts["sell"] + counts["strongSell"]) / n * 100),
        "score": round(score, 2),
        "consensus": label,
        "period": row.get("period"),
    }


def with_change(latest: dict, previous: dict | None) -> dict:
    """Add the score change vs the previous month (upgrades / downgrades)."""
    out = dict(latest)
    out["score_change"] = round(latest["score"] - previous["score"], 2) if previous else None
    return out


async def _fetch(client: httpx.AsyncClient, symbol: str) -> dict | None:
    try:
        r = await client.get(f"{BASE}/stock/recommendation", params={"symbol": symbol},
                             headers={"X-Finnhub-Token": settings.FINNHUB_API_KEY})
        r.raise_for_status()
        periods = sorted(r.json() or [], key=lambda p: p.get("period", ""), reverse=True)
    except Exception as e:  # noqa: BLE001
        log.warning("analyst.fetch_failed", symbol=symbol, error=str(e)[:160])
        return None
    if not periods:
        return None
    latest = consensus(periods[0])
    if not latest:
        return None
    prev = consensus(periods[1]) if len(periods) > 1 else None
    return {"symbol": symbol, **with_change(latest, prev)}


def _mock() -> list[dict]:
    rows = []
    for s in _UNIVERSE["US"][:20]:
        r = _seed(s + "analyst")
        sb, b, h = r.randint(2, 20), r.randint(2, 20), r.randint(1, 15)
        sl, ss = r.randint(0, 4), r.randint(0, 2)
        c = consensus({"strongBuy": sb, "buy": b, "hold": h, "sell": sl, "strongSell": ss, "period": "sample"})
        rows.append({"symbol": s, **c, "score_change": None, "sample": True})
    return rows


async def compute() -> list[dict]:
    if settings.DATA_MODE == "mock":
        return _mock()
    if not settings.FINNHUB_API_KEY:
        return []
    sem = asyncio.Semaphore(2)
    async with httpx.AsyncClient(timeout=10) as client:
        async def one(s):
            async with sem:
                row = await _fetch(client, s)
                await asyncio.sleep(1.1)  # ~2 calls/second total, far under 60/min
                return row
        rows = await asyncio.gather(*(one(s) for s in _UNIVERSE["US"]))
    return [r for r in rows if r]


async def get_ratings() -> list[dict]:
    return await snapshot.serve(KEY, compute, max_age=TTL, empty=[])
