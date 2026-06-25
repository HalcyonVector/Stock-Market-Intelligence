"""Market data service — quotes, candles, movers, heatmap. Cached via Redis."""
from __future__ import annotations

import json

from app.adapters.registry import providers
from app.core.config import settings
from app.core.redis import get_redis


async def _cached(key: str, ttl: int, producer):
    r = get_redis()
    try:
        hit = await r.get(key)
        if hit:
            return json.loads(hit)
    except Exception:  # noqa: BLE001 - cache is best-effort
        pass
    data = await producer()
    try:
        await r.set(key, json.dumps(data, default=str), ex=ttl)
    except Exception:  # noqa: BLE001
        pass
    return data


async def get_quote(symbol: str) -> dict:
    async def _p():
        q = await providers.market.quote(symbol)
        return q.__dict__
    return await _cached(f"quote:{symbol}", settings.REFRESH_MARKET, _p)


async def get_movers(market: str | None = None, limit: int = 10) -> dict:
    market = market or settings.DEFAULT_MARKET

    async def _p():
        syms = await providers.market.universe(market)
        quotes = await providers.market.quotes(syms)
        ranked = sorted(quotes, key=lambda q: q.change_pct, reverse=True)
        return {
            "gainers": [q.__dict__ for q in ranked[:limit]],
            "losers": [q.__dict__ for q in ranked[-limit:][::-1]],
            "most_active": [q.__dict__ for q in sorted(
                quotes, key=lambda q: q.volume, reverse=True)[:limit]],
        }
    return await _cached(f"movers:{market}", settings.REFRESH_MARKET, _p)


async def get_candles(symbol: str, interval: str = "1d", lookback: int = 90) -> list[dict]:
    candles = await providers.market.candles(symbol, interval, lookback)
    return [c.__dict__ for c in candles]
