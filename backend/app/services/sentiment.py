"""Retail sentiment aggregation across sources (Reddit/X/Trends)."""
from __future__ import annotations

from app.adapters.registry import providers


async def for_symbol(symbol: str) -> dict:
    snaps = await providers.sentiment.snapshot(symbol)
    if not snaps:
        return {"symbol": symbol, "sources": [], "aggregate": {}}
    agg = {
        "mention_volume": sum(s.mention_volume for s in snaps),
        "sentiment_score": round(sum(s.sentiment_score for s in snaps) / len(snaps), 2),
        "attention_score": round(max(s.attention_score for s in snaps), 1),
        "growth_rate": round(sum(s.growth_rate for s in snaps) / len(snaps), 1),
    }
    return {
        "symbol": symbol,
        "sources": [s.__dict__ for s in snaps],
        "aggregate": agg,
    }


async def trending(market: str = "GLOBAL", limit: int = 10) -> list[dict]:
    syms = await providers.market.universe(market)
    rows = []
    for s in syms:
        data = await for_symbol(s)
        rows.append({"symbol": s, **data["aggregate"]})
    rows.sort(key=lambda r: r.get("attention_score", 0), reverse=True)
    return rows[:limit]
