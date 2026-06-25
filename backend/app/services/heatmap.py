"""
Market heatmap data — returns stocks grouped by sector with market cap + change%.
Used for treemap visualization.
"""
from __future__ import annotations

import json
from app.core.redis import get_redis
from app.services.fundamentals import get_fundamentals
from app.adapters.registry import providers

UNIVERSE = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "V", "JNJ", "WMT", "PG", "XOM", "UNH", "HD", "MA", "DIS",
    "BAC", "ABBV", "PFE", "KO", "COST", "MRK", "TMO", "CSCO", "ACN",
    "LLY", "AVGO", "CRM", "ADBE", "AMD", "NFLX", "INTC", "QCOM",
    "ORCL", "TXN", "IBM", "GS", "MS", "WFC", "BLK", "PYPL",
    "SHOP", "PLTR", "COIN", "NIO", "BABA",
]


async def get_heatmap_data() -> dict:
    cache_key = "heatmap:data"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    sectors: dict[str, list] = {}

    for sym in UNIVERSE:
        try:
            quote = await providers.market.quote(sym)
            fund = await get_fundamentals(sym)

            sector = fund.get("sector", "Other") or "Other"
            if sector == "—":
                sector = "Other"

            entry = {
                "symbol": sym,
                "name": fund.get("name", sym),
                "price": quote.price,
                "change_pct": quote.change_pct or 0,
                "market_cap": fund.get("market_cap") or 0,
                "volume": quote.volume or 0,
            }
            sectors.setdefault(sector, []).append(entry)
        except Exception:
            continue

    # Sort each sector by market cap desc
    for s in sectors:
        sectors[s].sort(key=lambda x: x["market_cap"], reverse=True)

    result = {"sectors": sectors, "total_stocks": sum(len(v) for v in sectors.values())}

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=300)
    except Exception:
        pass

    return result
