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
    "You are a market analyst. Write a daily briefing in 2 short paragraphs "
    "(7-8 sentences total, around 100-130 words). Use ONLY the data provided. No advice, no targets.\n\n"
    "Paragraph 1: Cover the top gainers and losers with their percentage moves.\n"
    "Paragraph 2: Note leading sectors and highlight the top opportunity score names to watch."
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
    """API-facing — reads cache; never blocks on the full movers+AI pipeline.

    A cold-cache briefing fans out to movers, sector rotation, discovery and an
    AI call; computing it inline outlived the web proxy timeout (ECONNRESET in
    the logs). We instead return a lightweight placeholder and compute in the
    background; the next request serves the cached result.
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
            # No running loop (sync/test context) — compute inline.
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

    top_g = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["gainers"][:4])
    top_l = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["losers"][:4])
    lead_sec = sectors[0]["sector"] if sectors else "n/a"
    sec_summary = ", ".join(s["sector"] for s in sectors[:3]) if sectors else "n/a"
    opp_names = ", ".join(t["symbol"] for t in top[:3])
    prompt = (
        f"Gainers: {top_g}. Losers: {top_l}. "
        f"Top sectors: {sec_summary}. Leading: {lead_sec}. "
        f"Top opportunity scores: {opp_names}. "
        f"Write the 2-paragraph briefing."
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
