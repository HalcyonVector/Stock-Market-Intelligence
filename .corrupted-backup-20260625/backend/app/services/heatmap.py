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
    "TXN": "Technology", "MRVL": "Technology", "ON": "Techn