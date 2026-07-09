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
        # socket_timeout/socket_connect_timeout are required -- redis-py has no
        # default, so a stalled TLS connection to Upstash (or any transient
        # network blip) hangs the awaiting coroutine forever. This is directly
        # awaited (not offloaded to a thread), so unlike the yfinance-session
        # bug this doesn't stall the whole event loop, but it does stall
        # whichever single request or background task hit it -- exactly what
        # a since-observed 114s response on an otherwise-instant snapshot
        # read looked like.
        _pool = aioredis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True,
            socket_timeout=10, socket_connect_timeout=10,
        )
    return _pool


async def close_redis() -> None:
    """Close and reset the shared Redis pool (call before event loop closes)."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
