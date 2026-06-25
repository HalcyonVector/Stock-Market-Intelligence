"""AI market briefings & weekly reports built from movers + sectors + discovery."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import discovery, market, sector

SYSTEM = (
    "You are a market analyst writing a concise daily briefing for an EDUCATIONAL "
    "platform. Summarise what is happening using ONLY the data provided. No advice, "
    "no price targets. 4-6 sentences, neutral tone."
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

    top_g = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["gainers"][:3])
    top_l = ", ".join(f"{m['symbol']} {m['change_pct']:+.1f}%" for m in movers["losers"][:3])
    lead_sec = sectors[0]["sector"] if sectors else "n/a"
    prompt = (
        f"Top gainers: {top_g}\nTop losers: {top_l}\n"
        f"Leading sector: {lead_sec}\n"
        f"Highest opportunity scores: "
        f"{', '.join(t['symbol'] for t in top)}\n\nWrite the briefing."
    )
    text = await providers.ai.explain(SYSTEM, prompt)
    result = {
        "text": text,
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
