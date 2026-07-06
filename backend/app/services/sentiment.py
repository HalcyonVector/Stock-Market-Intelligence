"""Retail sentiment aggregation across sources (Reddit/X/Trends/StockTwits).

Pre-computed by Celery beat and cached in Redis for instant API response.
"""
from __future__ import annotations

import asyncio
import json

from app.adapters.registry import providers
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core import snapshot

log = get_logger("services.sentiment")

TRENDING_CACHE_KEY = "sentiment:trending:{market}"
# 24 h — same reasoning as sector.py: Celery beat refreshes this, the TTL just
# needs to outlast the worst-case weekend backoff (~9.6 h) so requests always
# hit cache instead of triggering an expensive inline scan.
TRENDING_TTL = 86_400  # 24 h


async def for_symbol(symbol: str) -> dict:
    snaps = await providers.sentiment.snapshot(symbol)
    if not snaps:
        return {"symbol": symbol, "sources": [], "aggregate": {}}
    agg = {
        "mention_volume": sum(s.mention_volume for s in snaps),
        "sentiment_score": round(sum(s.sentiment_score for s in snaps) / len(snaps), 2),
        "attention_score": round(max(s.attention_score for s in snaps), 1),
        "growth_rate": round(sum(s.growth_rate for s in snaps) / len(snaps), 1),
    }
    return {
        "symbol": symbol,
        "sources": [s.__dict__ for s in snaps],
        "aggregate": agg,
    }


async def _fetch_one(s: str, sem: asyncio.Semaphore) -> dict | None:
    async with sem:
        try:
            data = await asyncio.wait_for(for_symbol(s), timeout=8)
            return {"symbol": s, **data["aggregate"]}
        except Exception as e:
            log.warning("sentiment.symbol.skip", symbol=s, error=str(e))
            return None


async def compute_trending(market: str = "GLOBAL", limit: int = 10) -> list[dict]:
    """Heavy computation — called by Celery beat."""
    syms = await providers.market.universe(market)
    sem = asyncio.Semaphore(5)
    results = await asyncio.gather(*(_fetch_one(s, sem) for s in syms))
    rows = [r for r in results if r is not None and r.get("attention_score", 0) > 0]
    rows.sort(key=lambda r: r.get("attention_score", 0), reverse=True)
    result = rows[:limit]

    # Cache
    try:
        key = TRENDING_CACHE_KEY.format(market=market)
        await get_redis().set(key, json.dumps(result), ex=TRENDING_TTL)
        log.info("sentiment.cached", market=market, items=len(result))
    except Exception:
        pass

    await snapshot.write(TRENDING_CACHE_KEY.format(market=market), result)
    return result


# Serve stale sentiment instantly if older than an hour, refresh in background.
TRENDING_MAX_AGE = 3600  # 1 h


async def trending(market: str = "GLOBAL", limit: int = 10) -> list[dict]:
    """API-facing — serves the durable snapshot instantly and refreshes in the
    background. Never blocks on the (rate-limit-prone) live sentiment scan, so
    the Retail Sentiment card renders immediately instead of spinning."""
    key = TRENDING_CACHE_KEY.format(market=market)
    return await snapshot.serve(
        key,
        lambda: compute_trending(market, limit),
        max_age=TRENDING_MAX_AGE,
        empty=[],
    )
