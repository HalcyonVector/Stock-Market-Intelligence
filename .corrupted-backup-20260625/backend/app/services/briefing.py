"""AI market briefings & weekly reports built from movers + sectors + discovery."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import discovery, market, sector

SYSTEM = (
    "You are a market analyst. Write a daily briefing in 2 short paragraphs "
    "(7-8 sentences total, around 100-130 words). Use ONLY the data provided. No advice, no targets.\n\n"
    "Paragraph 1: Cover the top gainers and losers with their percentage moves.\n"
    "Paragraph 2: Note leading sectors and highlight the top opportunity score names to watch."
)

BRIEFING_TTL = 900  # cache for 15 minutes


async def daily(market_code: str = "GLOBAL") -> dict:
    cache_key = f"briefing:{market_code}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

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
        "market": 