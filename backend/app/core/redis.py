"""Shared async Redis client used for caching and pub/sub."""
from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

_pool: aioredis.Redis | None = None

# Pub/sub channel names
CH_PRICE_TICKS = "sdi:ticks"
CH_MARKET_EVENTS = "sdi:events"


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
    return _pool


async def close_redis() -> None:
    """Close and reset the shared Redis pool (call before event loop closes)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
