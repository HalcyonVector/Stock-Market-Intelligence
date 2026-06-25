"""
Finnhub.io provider — free tier: 60 calls/min.

Covers: quotes, company profiles, market news, basic financials.
Requires FINNHUB_API_KEY in env.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.adapters.base import (
    Candle, CompanyProfile, MarketDataProvider, NewsItem, NewsProvider, Quote,
)
from app.adapters.mock import _UNIVERSE
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.finnhub")

BASE = "https://finnhub.io/api/v1"


def _headers() -> dict:
    return {"X-Finnhub-Token": settings.FINNHUB_API_KEY}


class FinnhubMarketProvider(MarketDataProvider):
    name = "finnhub"

    async def quote(self, symbol: str) -> Quote:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{BASE}/quote", params={"symbol": symbol}, headers=_headers())
            r.raise_for_status()
            d = r.json()

        price = d.get("c")  # current price
        if not price or price == 0:
            raise ValueError(f"Finnhub returned no price for {symbol}")

        prev = d.get("pc") or price
        market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
        return Quote(
            symbol=symbol, price=round(price, 2),
            change=round(d.get("d") or (price - prev), 2),
            change_pct=round(d.get("dp") or ((price - prev) / prev * 100 if prev else 0), 2),
            volume=0,  # Finnhub quote endpoint doesn't return volume
            avg_volume=0,
            market_cap=None,
            currency="USD",
            market=market,
            ts=datetime.now(timezone.utc),
        )

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        # Respect rate limit: stagger requests slightly
        results = []
        for sym in symbols:
            try:
                results.append(await self.quote(sym))
                await asyncio.sleep(0.05)  # ~20 req/sec stays under 60/min
            except Exception as e:
                log.warning("finnhub.quote.skip", symbol=sym, error=str(e))
        return results

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        # /stock/candle is premium-only on the current Finnhub free tier and
        # returns HTTP 403 for free keys (see logs). Don't waste a request or
        # pollute logs with 403s — skip immediately so the chain moves on to the
        # next provider (Stooq / Alpha Vantage).
        raise NotImplementedError(
            "Finnhub /stock/candle requires a paid plan; skipped in fallback chain"
        )

    async def profile(self, symbol: str) -> CompanyProfile:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{BASE}/stock/profile2",
                params={"symbol": symbol},
                headers=_headers(),
            )
            r.raise_for_status()
            d = r.json()

        market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
        return CompanyProfile(
            symbol=symbol,
            name=d.get("name", symbol),
            sector=d.get("finnhubIndustry", "Unknown"),
            industry=d.get("finnhubIndustry", "Unknown"),
            market=market,
            currency=d.get("currency", "USD"),
            market_cap=d.get("marketCapitalization", 0) * 1e6 if d.get("marketCapitalization") else None,
            description="",
        )

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])


class FinnhubNewsProvider(NewsProvider):
    name = "finnhub"

    async def latest(self, symbol: str | None = None, limit: int = 20) -> list[NewsItem]:
        async with httpx.AsyncClient(timeout=10) as client:
            if symbol:
                r = await client.get(
                    f"{BASE}/company-news",
                    params={
                        "symbol": symbol,
                        "from": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "to": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    },
                    headers=_headers(),
                )
            else:
                r = await client.get(
                    f"{BASE}/news",
                    params={"category": "general"},
                    headers=_headers(),
                )
            r.raise_for_status()
            data = r.json()

        items = []
        for d in data[:limit]:
            items.append(NewsItem(
                symbol=symbol,
                headline=d.get("headline", ""),
                url=d.get("url", ""),
                source=d.get("source", "Finnhub"),
                published_at=datetime.fromtimestamp(d.get("datetime", 0), tz=timezone.utc),
                summary=d.get("summary", "")[:300],
            ))
        return items


async def finnhub_fundamentals(symbol: str) -> dict | None:
    """Fetch basic financials from Finnhub. Returns dict or None on failure."""
    if not settings.FINNHUB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{BASE}/stock/metric",
                params={"symbol": symbol, "metric": "all"},
                headers=_headers(),
            )
            r.raise_for_status()
            data = r.json()

        m = data.get("metric", {})
        if not m:
            return None

        # Map Finnhub metric keys to our schema
        return {
            "symbol": symbol,
            "pe_trailing": m.get("peExclExtraTTM"),
            "pe_forward": m.get("peNormalizedAnnual") or m.get("peTTM"),
            "peg_ratio": m.get("pegRatio"),
            "price_to_book": m.get("pbQuarterly"),
            "price_to_sales": m.get("psTTM"),
            "revenue": m.get("revenuePerShareTTM"),
            "revenue_growth": m.get("revenueGrowthQuarterlyYoy"),
            "earnings_growth": m.get("epsGrowthTTMYoy"),
            "gross_margins": m.get("grossMarginTTM"),
            "operating_margins": m.get("operatingMarginTTM"),
            "profit_margins": m.get("netProfitMarginTTM"),
            "eps_trailing": m.get("epsTTM"),
            "eps_forward": m.get("epsEstimateNextQuarter"),
            "book_value": m.get("bookValuePerShareQuarterly"),
            "debt_to_equity": m.get("totalDebt/totalEquityQuarterly"),
            "current_ratio": m.get("currentRatioQuarterly"),
            "quick_ratio": m.get("quickRatioQuarterly"),
            "dividend_yield": m.get("dividendYieldIndicatedAnnual"),
            "beta": m.get("beta"),
            "fifty_two_week_high": m.get("52WeekHigh"),
            "fifty_two_week_low": m.get("52WeekLow"),
            "market_cap": m.get("marketCapitalization"),
            "ev_to_ebitda": m.get("enterpriseValueEBITDATTM"),
            "short_ratio": m.get("shortInterestRatioMRQ"),
            "recommendation": None,
            "num_analysts": m.get("numberOfAnalysts"),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        log.warning("finnhub.fundamentals.error", symbol=symbol, error=str(e))
        return None
