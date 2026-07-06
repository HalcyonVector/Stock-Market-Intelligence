"""
Discovery Engine — surfaces interesting stocks across the universe by scanning
quotes + candles + sentiment and ranking by opportunity sub-signals.
"""
from __future__ import annotations

import asyncio
import json

from app.adapters.registry import providers
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core import snapshot
from app.scoring.engine import all_scores
from app.scoring.indicators import build_inputs

log = get_logger("services.discovery")

# Cap concurrent symbol scans so live providers stay under free-tier rate limits
# while still finishing the full universe in seconds instead of minutes.
_SCAN_CONCURRENCY = 8


def _key(market: str) -> str:
    return f"discovery:{market}"


async def compute_scan(market: str | None = None) -> list[dict]:
    """Heavy universe scan. Runs in the background (startup warm, keep-alive
    cron, Celery beat) -- never on the request path."""
    market = market or settings.DEFAULT_MARKET
    r = get_redis()
    key = _key(market)
    syms = await providers.market.universe(market)
    sem = asyncio.Semaphore(_SCAN_CONCURRENCY)

    async def _score_symbol(sym: str) -> dict | None:
        """Score one symbol. A single symbol's failure must not sink the scan."""
        async with sem:
            try:
                quote = await providers.market.quote(sym)
                candles = await providers.market.candles(sym, "1d", 60)
                sentiment = await providers.sentiment.snapshot(sym)
                inputs = build_inputs(quote, candles, sentiment)
                scores = all_scores(inputs)
                return {
                    "symbol": sym,
                    "price": quote.price,
                    "change_pct": quote.change_pct,
                    "volume_ratio": round(inputs.volume_ratio, 2),
                    "scores": {k: v.value for k, v in scores.items()},
                    "opportunity": scores["opportunity"].value,
                }
            except Exception as e:  # noqa: BLE001
                log.warning("discovery.symbol_failed", symbol=sym, error=str(e))
                return None

    scored = await asyncio.gather(*(_score_symbol(s) for s in syms))
    rows: list[dict] = [r for r in scored if r is not None]
    rows.sort(key=lambda x: x["opportunity"], reverse=True)
    try:
        await r.set(key, json.dumps(rows, default=str), ex=settings.REFRESH_SCORES)
    except Exception:  # noqa: BLE001
        pass
    await snapshot.write(key, rows)
    return rows


async def scan(market: str | None = None) -> list[dict]:
    """API-facing. Serves the last durable snapshot instantly and refreshes in
    the background when stale -- so a cold cache never blocks the request on a
    full universe scan."""
    market = market or settings.DEFAULT_MARKET
    key = _key(market)
    return await snapshot.serve(
        key,
        lambda: compute_scan(market),
        max_age=settings.REFRESH_SCORES,
        empty=[],
    )


async def buckets(market: str | None = None) -> dict:
    rows = await scan(market)
    return {
        "momentum_leaders": sorted(rows, key=lambda r: r["scores"]["momentum"], reverse=True)[:6],
        "volume_breakouts": sorted(rows, key=lambda r: r["volume_ratio"], reverse=True)[:6],
        "sentiment_surges": sorted(rows, key=lambda r: r["scores"]["attention"], reverse=True)[:6],
        "top_opportunities": rows[:6],
    }
