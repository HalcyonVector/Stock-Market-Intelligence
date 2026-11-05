"""
Weekly watchlist digest: how each stock in a watchlist did over the last five
trading days, plus a short plain-English AI recap.

Free-tier budget: prices come from the daily history snapshot (memory/Redis
cached). The AI recap is cached in Redis per *set of symbols* per day, so a
watchlist costs at most one Groq call a day no matter how often it's opened,
and identical watchlists share it.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import date

from app.adapters.ai import ai_cache_ttl
from app.adapters.registry import providers
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("services.digest")

MAX_SYMBOLS = 30
DIGEST_TTL = 24 * 3600

SYSTEM = (
    "You write a short weekly recap of a beginner investor's watchlist. "
    "Use only the numbers given. 3-5 sentences, plain English, no jargon, "
    "no advice to buy or sell, no predictions. Mention the biggest mover up "
    "and down and whether the group mostly rose or fell."
)


async def _week(symbol: str) -> dict | None:
    try:
        candles = await providers.market.candles(symbol, "1d", 14)
    except Exception:  # noqa: BLE001
        return None
    closes = [c.close for c in candles if c.close]
    if len(closes) < 2:
        return None
    base = closes[-6] if len(closes) >= 6 else closes[0]
    return {
        "symbol": symbol,
        "close": round(closes[-1], 2),
        "week_change_pct": round((closes[-1] - base) / base * 100, 2) if base else 0.0,
        "day_change_pct": round((closes[-1] - closes[-2]) / closes[-2] * 100, 2) if closes[-2] else 0.0,
        "as_of": candles[-1].ts.date().isoformat(),
        "spark": [round(c, 2) for c in closes[-6:]],
    }


async def watchlist_digest(symbols: list[str]) -> dict:
    syms = sorted({s.strip().upper() for s in symbols if s.strip()})[:MAX_SYMBOLS]
    if not syms:
        return {"rows": [], "summary": None, "up": 0, "down": 0}

    sem = asyncio.Semaphore(4)

    async def one(s: str):
        async with sem:
            return await _week(s)

    rows = [r for r in await asyncio.gather(*(one(s) for s in syms)) if r]
    rows.sort(key=lambda r: r["week_change_pct"], reverse=True)
    up = sum(1 for r in rows if r["week_change_pct"] > 0)
    down = sum(1 for r in rows if r["week_change_pct"] < 0)
    avg = round(sum(r["week_change_pct"] for r in rows) / len(rows), 2) if rows else 0.0

    summary = None
    if rows:
        summary = await _ai_recap(syms, rows, up, down, avg)
    return {"rows": rows, "summary": summary, "up": up, "down": down, "avg_week_change_pct": avg}


async def _ai_recap(syms: list[str], rows: list[dict], up: int, down: int, avg: float) -> str | None:
    key = f"digest:{hashlib.sha1(','.join(syms).encode()).hexdigest()[:16]}:{date.today().isoformat()}"
    r = get_redis()
    try:
        hit = await r.get(key)
        if hit:
            return json.loads(hit)
    except Exception:  # noqa: BLE001
        pass
    lines = "\n".join(
        f"{x['symbol']}: {x['week_change_pct']:+.2f}% over 5 trading days, last close {x['close']}"
        for x in rows
    )
    prompt = (f"Watchlist of {len(rows)} stocks. {up} rose, {down} fell, "
              f"average change {avg:+.2f}%.\n{lines}\n\nWrite the recap.")
    try:
        text = (await providers.ai.explain(SYSTEM, prompt)).strip()
    except Exception as e:  # noqa: BLE001
        log.warning("digest.ai_failed", error=str(e)[:160])
        return None
    try:
        await r.set(key, json.dumps(text), ex=ai_cache_ttl(DIGEST_TTL))
    except Exception:  # noqa: BLE001
        pass
    return text
