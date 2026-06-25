"""
Discovery Engine — surfaces interesting stocks across the universe by scanning
quotes + candles + sentiment and ranking by opportunity sub-signals.
"""
from __future__ import annotations

import json

from app.adapters.registry import providers
from app.core.config import settings
from app.core.redis import get_redis
from app.scoring.engine import all_scores
from app.scoring.indicators import build_inputs


async def scan(market: str | None = None) -> list[dict]:
    market = market or settings.DEFAULT_MARKET
    r = get_redis()
    key = f"discovery:{market}"
    try:
        hit = await r.get(key)
        if hit:
            return json.loads(hit)
    except Exception:  # noqa: BLE001
        pass

    syms = await providers.market.universe(market)
    rows: list[dict] = []
    for sym in syms:
        quote = await providers.market.quote(sym)
        candles = await providers.market.candles(sym, "1d", 60)
        sentiment = await providers.sentiment.snapshot(sym)
        inputs = build_inputs(quote, candles, sentiment)
        scores = all_scores(inputs)
        rows.append({
            "symbol": sym,
            "price": quote.price,
            "change_pct": quote.change_pct,
            "volume_ratio": round(inputs.volume_ratio, 2),
            "scores": {k: v.value for k, v in scores.items()},
            "opportunity": scores["opportunity"].value,
        })
    rows.sort(key=lambda x: x["opportunity"], reverse=True)
    try:
        await r.set(key, json.dumps(rows, default=str), ex=settings.REFRESH_SCORES)
    except Exception:  # noqa: BLE001
        pass
    return rows


async def buckets(market: str | None = None) -> dict:
    rows = await scan(market)
    return {
        "momentum_leaders": sorted(rows, key=lambda r: r["scores"]["momentum"], reverse=True)[:6],
        "volume_breakouts": sorted(rows, key=lambda r: r["volume_ratio"], reverse=True)[:6],
        "sentiment_surges": sorted(rows, key=lambda r: r["scores"]["attention"], reverse=True)[:6],
        "top_opportunities": rows[:6],
    }
