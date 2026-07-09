"""Market data service — quotes, candles, movers, heatmap. Cached via Redis."""
from __future__ import annotations

import json

from app.adapters.registry import providers
from app.core.config import settings
from app.core.redis import get_redis
from app.core import snapshot


def _movers_key(market: str) -> str:
    return f"movers:{market}"


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


async def compute_movers(market: str | None = None) -> dict:
    """Heavy universe quote fetch. Runs in the background (startup warm,
    keep-alive cron) -- never on the request path."""
    market = market or settings.DEFAULT_MARKET
    syms = await providers.market.universe(market)
    quotes = await providers.market.quotes(syms)
    ranked = sorted(quotes, key=lambda q: q.change_pct, reverse=True)
    result = {
        "gainers": [q.__dict__ for q in ranked],
        "losers": [q.__dict__ for q in ranked[::-1]],
        "most_active": [q.__dict__ for q in sorted(
            quotes, key=lambda q: q.volume, reverse=True)],
    }
    await snapshot.write(_movers_key(market), result)
    return result


async def get_movers(market: str | None = None, limit: int = 10) -> dict:
    """API-facing. Serves the last durable snapshot instantly and refreshes in
    the background when stale -- so a cold cache never blocks the request on a
    full universe quote fetch."""
    market = market or settings.DEFAULT_MARKET
    data = await snapshot.serve(
        _movers_key(market),
        lambda: compute_movers(market),
        max_age=settings.REFRESH_MARKET,
        empty={"gainers": [], "losers": [], "most_active": []},
    )
    return {
        "gainers": data.get("gainers", [])[:limit],
        "losers": data.get("losers", [])[:limit],
        "most_active": data.get("most_active", [])[:limit],
    }


async def get_candles(symbol: str, interval: str = "1d", lookback: int = 90) -> list[dict]:
    candles = await providers.market.candles(symbol, interval, lookback)
    return [c.__dict__ for c in candles]
