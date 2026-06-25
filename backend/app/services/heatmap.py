"""
Market heatmap data — returns stocks grouped by sector with market cap + change%.
Concurrent fetching + Redis cache. Pre-computed by Celery beat.
"""
from __future__ import annotations

import asyncio
import json

from app.core.logging import get_logger
from app.core.redis import get_redis
from app.adapters.registry import providers

log = get_logger("services.heatmap")

UNIVERSE = [
    # Mega-cap tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "CRM",
    "NFLX", "ORCL", "ADBE", "CSCO", "ACN", "IBM", "SHOP", "SNOW", "PANW", "NOW",
    "UBER", "ABNB",
    # Fintech / Growth
    "PLTR", "SOFI", "COIN", "SQ", "PYPL", "HOOD", "MARA",
    # Semiconductors
    "SMCI", "INTC", "QCOM", "MU", "TXN", "MRVL", "ON", "LRCX", "KLAC", "AMAT",
    # Healthcare / Pharma
    "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "AMGN", "GILD", "ISRG",
    "DXCM", "MRNA", "VRTX",
    # Finance
    "JPM", "V", "MA", "GS", "BAC", "MS", "WFC", "BLK", "SCHW", "AXP", "C",
    # Consumer / Retail
    "WMT", "COST", "KO", "PEP", "DIS", "NKE", "SBUX", "MCD", "HD", "LOW", "TGT",
    "LULU",
    # Energy / Industrial
    "XOM", "CAT", "BA", "CVX", "COP", "GE", "HON", "UPS", "DE", "RTX", "LMT",
    # Telecom / Media
    "T", "VZ", "CMCSA", "TMUS",
    # Other
    "BRK-B", "PG", "NIO", "BABA", "RIVN", "MANU",
]

# Hardcoded sectors — avoids slow fundamentals lookups per symbol
SECTOR_MAP: dict[str, str] = {
    # Technology
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "GOOGL": "Technology", "META": "Technology", "AVGO": "Technology",
    "AMD": "Technology", "CRM": "Technology", "ORCL": "Technology",
    "ADBE": "Technology", "CSCO": "Technology", "ACN": "Technology",
    "IBM": "Technology", "SHOP": "Technology", "SNOW": "Technology",
    "PANW": "Technology", "NOW": "Technology", "PLTR": "Technology",
    "INTC": "Technology", "QCOM": "Technology", "MU": "Technology",
    "TXN": "Technology", "MRVL": "Technology", "ON": "Technology",
    "LRCX": "Technology", "KLAC": "Technology", "AMAT": "Technology",
    "SMCI": "Technology",
    # Communication Services
    "NFLX": "Communication Services", "DIS": "Communication Services",
    "T": "Communication Services", "VZ": "Communication Services",
    "CMCSA": "Communication Services", "TMUS": "Communication Services",
    # Consumer Cyclical
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical",
    "HD": "Consumer Cyclical", "NKE": "Consumer Cyclical",
    "SBUX": "Consumer Cyclical", "MCD": "Consumer Cyclical",
    "LOW": "Consumer Cyclical", "TGT": "Consumer Cyclical",
    "LULU": "Consumer Cyclical", "UBER": "Consumer Cyclical",
    "ABNB": "Consumer Cyclical", "NIO": "Consumer Cyclical",
    "BABA": "Consumer Cyclical", "RIVN": "Consumer Cyclical",
    "MANU": "Consumer Cyclical",
    # Consumer Defensive
    "WMT": "Consumer Defensive", "COST": "Consumer Defensive",
    "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
    "PG": "Consumer Defensive",
    # Financial Services
    "JPM": "Financial Services", "V": "Financial Services",
    "MA": "Financial Services", "GS": "Financial Services",
    "BAC": "Financial Services", "MS": "Financial Services",
    "WFC": "Financial Services", "BLK": "Financial Services",
    "SCHW": "Financial Services", "AXP": "Financial Services",
    "C": "Financial Services", "BRK-B": "Financial Services",
    "COIN": "Financial Services", "SQ": "Financial Services",
    "PYPL": "Financial Services", "SOFI": "Financial Services",
    "HOOD": "Financial Services", "MARA": "Financial Services",
    # Healthcare
    "UNH": "Healthcare", "JNJ": "Healthcare", "LLY": "Healthcare",
    "PFE": "Healthcare", "ABBV": "Healthcare", "MRK": "Healthcare",
    "TMO": "Healthcare", "AMGN": "Healthcare", "GILD": "Healthcare",
    "ISRG": "Healthcare", "DXCM": "Healthcare", "MRNA": "Healthcare",
    "VRTX": "Healthcare",
    # Energy
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    # Industrials
    "CAT": "Industrials", "BA": "Industrials", "GE": "Industrials",
    "HON": "Industrials", "UPS": "Industrials", "DE": "Industrials",
    "RTX": "Industrials", "LMT": "Industrials",
}

# Approximate market caps (USD) for sizing — exact values not critical
MCAP_APPROX: dict[str, float] = {
    "AAPL": 3400e9, "MSFT": 3200e9, "NVDA": 3100e9, "GOOGL": 2200e9, "AMZN": 2100e9,
    "META": 1500e9, "TSLA": 800e9, "BRK-B": 1000e9, "AVGO": 800e9, "LLY": 700e9,
    "JPM": 700e9, "V": 600e9, "WMT": 600e9, "UNH": 500e9, "XOM": 500e9,
    "MA": 430e9, "PG": 400e9, "COST": 400e9, "JNJ": 380e9, "HD": 380e9,
    "ORCL": 350e9, "BAC": 350e9, "ABBV": 330e9, "NFLX": 300e9, "KO": 280e9,
    "MRK": 280e9, "CRM": 280e9, "CVX": 270e9, "ADBE": 250e9, "AMD": 250e9,
    "BABA": 250e9, "CSCO": 240e9, "ACN": 230e9, "WFC": 230e9, "MCD": 220e9,
    "PEP": 220e9, "DIS": 200e9, "IBM": 200e9, "QCOM": 200e9, "TMO": 200e9,
    "GE": 200e9, "NOW": 190e9, "TXN": 180e9, "GS": 180e9, "MS": 170e9,
    "AMGN": 170e9, "AXP": 170e9, "ISRG": 170e9, "RTX": 160e9, "LMT": 160e9,
    "PLTR": 150e9, "PFE": 150e9, "BLK": 150e9, "CAT": 170e9, "BA": 140e9,
    "HON": 150e9, "LOW": 150e9, "UPS": 140e9, "DE": 130e9, "SCHW": 140e9,
    "PANW": 130e9, "UBER": 160e9, "ABNB": 90e9, "SNOW": 70e9, "SQ": 50e9,
    "INTC": 120e9, "NKE": 100e9, "SBUX": 110e9, "SHOP": 120e9, "GILD": 110e9,
    "VRTX": 120e9, "TMUS": 270e9, "T": 160e9, "VZ": 170e9, "CMCSA": 160e9,
    "COP": 130e9, "C": 130e9, "TGT": 70e9, "LULU": 45e9, "MU": 110e9,
    "MRVL": 80e9, "ON": 30e9, "LRCX": 100e9, "KLAC": 90e9, "AMAT": 150e9,
    "SMCI": 30e9, "SOFI": 15e9, "COIN": 60e9, "PYPL": 80e9, "HOOD": 30e9,
    "MARA": 8e9, "DXCM": 30e9, "MRNA": 20e9, "NIO": 10e9, "RIVN": 15e9,
    "MANU": 4e9,
}

CACHE_KEY = "heatmap:data"
CACHE_TTL = 300


async def _fetch_one(sym: str, sem: asyncio.Semaphore) -> dict | None:
    async with sem:
        try:
            quote = await asyncio.wait_for(providers.market.quote(sym), timeout=8)
            mcap = getattr(quote, "market_cap", None) or MCAP_APPROX.get(sym, 50e9)
            return {
                "symbol": sym,
                "name": sym,
                "price": quote.price,
                "change_pct": quote.change_pct or 0,
                "market_cap": mcap,
                "volume": quote.volume or 0,
                "sector": SECTOR_MAP.get(sym, "Other"),
            }
        except Exception as e:
            log.warning("heatmap.skip", symbol=sym, error=str(e))
            return None


async def compute_heatmap() -> dict:
    """Heavy computation — called by Celery beat or on cache miss."""
    sem = asyncio.Semaphore(8)
    results = await asyncio.gather(*(_fetch_one(s, sem) for s in UNIVERSE))

    sectors: dict[str, list] = {}
    for entry in results:
        if entry is None:
            continue
        sector = entry.pop("sector")
        sectors.setdefault(sector, []).append(entry)

    for s in sectors:
        sectors[s].sort(key=lambda x: x["market_cap"], reverse=True)

    result = {"sectors": sectors, "total_stocks": sum(len(v) for v in sectors.values())}

    r = get_redis()
    try:
        await r.set(CACHE_KEY, json.dumps(result, default=str), ex=CACHE_TTL)
    except Exception:
        pass

    return result


async def get_heatmap_data() -> dict:
    """API-facing — reads cache first, computes if missing."""
    r = get_redis()
    try:
        hit = await r.get(CACHE_KEY)
        if hit:
            return json.loads(hit)
    except Exception:
        pass
    return await compute_heatmap()
