"""
Deterministic mock providers.

Why mock-first: a solo engineer needs the entire UI + pipeline + scoring to run
offline, with zero API keys and no rate limits. Mock data is seeded from the
symbol string so values are stable across requests (good for demos and tests).
Swap DATA_MODE=live to use the free-tier providers instead.
"""
from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta, timezone

from app.adapters.base import (
    AIProvider,
    Candle,
    CompanyProfile,
    MarketDataProvider,
    NewsItem,
    NewsProvider,
    Quote,
    SentimentProvider,
    SentimentSnapshot,
)

SECTORS = [
    "Banking", "IT", "Pharma", "Auto", "Defence",
    "Capital Goods", "Energy", "Infrastructure", "FMCG",
]

_UNIVERSE = {
    "US": [
        # Mega-cap tech
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "CRM",
        "NFLX", "ORCL", "ADBE", "CSCO", "ACN", "IBM", "SHOP", "SNOW", "PANW", "NOW",
        "UBER", "ABNB",
        # Fintech / Growth
        "PLTR", "SOFI", "AFRM", "COIN", "SQ", "PYPL", "HOOD", "MARA",
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
        "BRK-B", "PG", "MANU", "NIO", "BABA", "RIVN",
    ],
    "IN": [
        # Banking / Finance
        "RELIANCE", "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK",
        "BAJFINANCE", "BAJAJFINSV", "HDFCLIFE", "SBILIFE", "PNBHOUSING",
        # IT
        "TCS", "INFY", "WIPRO", "TECHM", "LTIM", "HCLTECH", "PERSISTENT", "COFORGE",
        # Auto
        "TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "EICHERMOT", "TVSMOTOR", "HEROMOTOCO",
        # Pharma / Healthcare
        "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP", "MAXHEALTH", "BIOCON",
        # Defence / Capital Goods
        "HAL", "BEL", "LT", "BHEL", "MAZAGON", "COCHINSHIP",
        # Energy / Power
        "NTPC", "POWERGRID", "ADANIGREEN", "ONGC", "COALINDIA", "TATAPOWER", "GAIL",
        # FMCG / Consumer
        "ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "TATACONSUM", "DABUR", "MARICO",
        "GODREJCP",
        # Infrastructure / Metals
        "ADANIENT", "TATASTEEL", "HINDALCO", "JSWSTEEL", "ADANIPORTS", "DLF",
        # Telecom
        "BHARTIARTL", "IDEA",
    ],
    "GLOBAL": [
        # US — broad coverage (65)
        "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "CRM",
        "NFLX", "ORCL", "ADBE", "CSCO", "ACN", "IBM", "SHOP", "SNOW", "PANW", "NOW",
        "UBER", "ABNB",
        "PLTR", "SOFI", "COIN", "SQ", "PYPL", "HOOD",
        "SMCI", "INTC", "QCOM", "MU", "TXN", "MRVL", "AMAT",
        "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "AMGN", "MRNA",
        "JPM", "V", "MA", "GS", "BAC", "MS", "WFC", "BLK",
        "WMT", "COST", "KO", "DIS", "NKE", "MCD", "HD",
        "XOM", "CAT", "BA", "CVX", "GE", "RTX", "LMT",
        "BRK-B", "PG", "NIO", "BABA",
        # India — broad coverage (45)
        "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "KOTAKBANK",
        "BAJFINANCE", "AXISBANK", "HDFCLIFE",
        "TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "HEROMOTOCO",
        "HAL", "BEL", "LT", "BHEL", "MAZAGON",
        "SUNPHARMA", "DRREDDY", "CIPLA", "APOLLOHOSP",
        "ITC", "HINDUNILVR", "NESTLEIND", "BRITANNIA", "TATACONSUM",
        "NTPC", "POWERGRID", "ADANIENT", "TATASTEEL", "HINDALCO", "TATAPOWER",
        "HCLTECH", "WIPRO", "TECHM", "PERSISTENT",
        "ADANIPORTS", "BHARTIARTL", "COALINDIA", "ONGC", "GAIL", "DLF",
    ],
}


def _seed(symbol: str) -> random.Random:
    h = int(hashlib.sha256(symbol.encode()).hexdigest(), 16) % (2**32)
    return random.Random(h)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MockMarketProvider(MarketDataProvider):
    name = "mock"

    async def quote(self, symbol: str) -> Quote:
        r = _seed(symbol)
        base = 20 + r.random() * 480
        change_pct = r.uniform(-9, 11)
        price = round(base * (1 + change_pct / 100), 2)
        vol = int(r.uniform(0.5, 6) * 1_000_000)
        avg = int(vol / r.uniform(0.4, 2.2))
        market = next((m for m, syms in _UNIVERSE.items() if symbol in syms), "US")
        return Quote(
            symbol=symbol, price=price, change=round(price - base, 2),
            change_pct=round(change_pct, 2), volume=vol, avg_volume=avg,
            market_cap=round(price * r.uniform(5e7, 3e9), 0),
            currency="INR" if market == "IN" else "USD",
            market=market, ts=_now(),
        )

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        return [await self.quote(s) for s in symbols]

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        r = _seed(symbol + interval)
        out, price = [], 20 + r.random() * 480
        for i in range(lookback):
            drift = math.sin(i / 7) * 2 + r.uniform(-3, 3)
            o = price
            price = max(1.0, price + drift)
            hi = max(o, price) * (1 + r.uniform(0, 0.02))
            lo = min(o, price)