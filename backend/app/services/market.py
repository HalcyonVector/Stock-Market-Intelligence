"""Market data service — quotes, candles, movers, heatmap. Cached via Redis."""
from __future__ import annotations

import asyncio
import json

from app.adapters.registry import providers
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core import snapshot

log = get_logger("services.market")

# Cap concurrency and bound each symbol with a timeout, mirroring
# discovery.py/sector.py -- providers.market.quotes() has no timeout of its
# own anywhere in the provider chain, so a single stalled connection (common
# on shared cloud IPs hitting Yahoo) can hang the whole bulk fetch forever.
# Must clear _run_yf's own worst case (3 attempts x up to 8s socket timeout
# each + backoff between => ~29s) before it falls through to its internal
# mock -- anything shorter turns every rate-limited-but-fine symbol into a
# false failure and empties the whole scan.
_MOVERS_CONCURRENCY = 8
_MOVERS_TIMEOUT = 35


def _movers_key(market: str) -> str:
    return f"movers:{market}"


async def _quote_or_none(symbol: str, sem: asyncio.Semaphore):
    async with sem:
        try:
            return await asyncio.wait_for(providers.market.quote(symbol), timeout=_MOVERS_TIMEOUT)
        except Exception as e:  # noqa: BLE001 -- one bad symbol must not sink the scan
            log.warning("movers.symbol_skip", symbol=symbol, error=str(e))
            return None


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
    sem = asyncio.Semaphore(_MOVERS_CONCURRENCY)
    results = await asyncio.gather(*(_quote_or_none(s, sem) for s in syms))
    quotes = [q for q in results if q is not None]
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
