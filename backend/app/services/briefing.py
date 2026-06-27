"""AI market briefings & weekly reports built from movers + sectors + discovery."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.services import discovery, market, sector

log = get_logger("services.briefing")

SYSTEM = (
    "You are a market analyst. Write a daily briefing in 3 paragraphs "
    "(10-12 sentences total, around 180-220 words). Use ONLY the data provided. No advice, no targets.\n\n"
    "Paragraph 1: Cover the top gainers with their percentage moves and briefly note what sectors they belong to.\n"
    "Paragraph 2: Cover the top losers, their percentage drops, and any patterns (e.g. sector-wide weakness).\n"
    "Paragraph 3: Highlight leading sectors, sector rotation signals, and the top opportunity score names to watch with a brief note on why they stand out."
)

BRIEFING_TTL = 900  # cache for 15 minutes

_inflight: set[str] = set()


def _placeholder(market_code: str) -> dict:
    return {
        "briefing": "Daily briefing is being generated — check back in a moment.",
        "market": market_code,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "movers": {"gainers": [], "losers": []},
        "leading_sector": "n/a",
        "pending": True,
    }


async def _compute_and_clear(market_code: str) -> None:
    try:
        await compute_daily(market_code)
    finally:
        _inflight.discard(market_code)


async def daily(market_code: str = "GLOBAL") -> dict:
    """API-facing — reads cache; kicks background compute and returns placeholder
    on cache miss, but auto-retries via the frontend's 30s polling.

    The startup cache warm (in main.py lifespan) normally ensures the briefing
    is ready before the first browser request.  On a cold miss we still fire a
    background task (briefing requires an AI call that can take 10-20s, too slow
    for inline), but the frontend's refetchInterval will pick up the result on
    the next poll.
    """
    cache_key = f"briefing:{market_code}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    if market_code not in _inflight:
        _inflight.add(market_code)
        try:
            asyncio.create_task(_compute_and_clear(market_code))
        except RuntimeError:
            _inflight.discard(market_code)
            return await compute_daily(market_code)
    return _placeholder(market_code)


async def compute_daily(market_code: str = "GLOBAL") -> dict:
    """Heavy briefing pipeline — runs in the background or via Celery beat."""
    cache_key = f"briefing:{market_code}"
    r = get_redis()
    movers = await market.get_movers(market_code, limit=5)
    sectors = await sector.rotation(market_code)
    top = (await discovery.scan(market_code))[:5]

    top_g = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["gainers"][:5])
    top_l = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["losers"][:5])
    lead_sec = sectors[0]["sector"] if sectors else "n/a"
    sec_summary = ", ".join(
        f"{s['sector']} ({s.get('change_pct', 0):+.1f}%)" for s in sectors[:4]
    ) if sectors else "n/a"
    opp_names = ", ".join(t["symbol"] for t in top[:4])
    prompt = (
        f"Gainers: {top_g}. Losers: {top_l}. "
        f"Top sectors: {sec_summary}. Leading: {lead_sec}. "
        f"Top opportunity scores: {opp_names}. "
        f"Write the 3-paragraph briefing."
    )
    text = await providers.ai.explain(SYSTEM, prompt)
    result = {
        "briefing": text,
        "market": market_code,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "movers": movers,
        "leading_sector": lead_sec,
    }

    try:
        await r.set(cache_key, json.dumps(result), ex=BRIEFING_TTL)
    except Exception:
        pass

    return result
