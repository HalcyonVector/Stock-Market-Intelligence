"""Sector rotation — aggregate symbol flows into sector momentum/in-out flows."""
from __future__ import annotations

from collections import defaultdict

from app.adapters.registry import providers
from app.scoring.indicators import build_inputs
from app.scoring.engine import momentum_score


async def rotation(market: str = "GLOBAL") -> list[dict]:
    syms = await providers.market.universe(market)
    by_sector: dict[str, list[float]] = defaultdict(list)
    flow: dict[str, float] = defaultdict(float)
    for s in syms:
        profile = await providers.market.profile(s)
        quote = await providers.market.quote(s)
        candles = await providers.market.candles(s, "1d", 30)
        mom = momentum_score(build_inputs(quote, candles)).value
        by_sector[profile.sector].append(mom)
        flow[profile.sector] += quote.change_pct * (quote.market_cap or 1) / 1e9

    out = []
    for sector, moms in by_sector.items():
        out.append({
            "sector": sector,
            "momentum": round(sum(moms) / len(moms), 1),
            "net_flow": round(flow[sector], 2),
            "constituents": len(moms),
            "direction": "inflow" if flow[sector] >= 0 else "outflow",
        })
    out.sort(key=lambda x: x["momentum"], reverse=True)
    return out
