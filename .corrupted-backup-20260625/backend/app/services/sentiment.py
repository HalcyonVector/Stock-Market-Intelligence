"""Retail sentiment aggregation across sources (Reddit/X/Trends/StockTwits).

Pre-computed by Celery beat and cached in Redis for instant API response.
"""
from __future__ import annotations

import asyncio
import json

from app.adapters.registry import providers
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("services.sentiment")

TRENDING_CACHE_KEY = "sentiment:trending:{market}"
TRENDING_TTL = 600  # 10 min


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


async def _fetch_one(s: str, sem