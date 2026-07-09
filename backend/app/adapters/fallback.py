"""
Fallback chain provider — tries each data source in order until one succeeds.

Order: yfinance (free, no key) → Finnhub (free, key) → Alpha Vantage (free, key)
       → Mock (always works, last resort)

Each call is Redis-cached so subsequent hits are instant. Cache TTL varies by
data type: quotes 5 min, candles 15 min, profiles 60 min.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.adapters.base import (
    Candle, CompanyProfile, MarketDataProvider, NewsItem, NewsProvider, Quote,
)
from app.adapters.mock import MockMarketProvider, MockNewsProvider, _UNIVERSE
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("adapters.fallback")

# Cache TTLs in seconds
QUOTE_TTL = 300       # 5 minutes
CANDLE_TTL = 900      # 15 minutes
PROFILE_TTL = 3600    # 1 hour


def _build_market_chain() -> list[MarketDataProvider]:
    """Build ordered list of available market providers."""
    chain: list[MarketDataProvider] = []

    # 1. yfinance — always available (no key needed)
    try:
        from app.adapters.live import YFinanceMarketProvider
        chain.append(YFinanceMarketProvider())
    except Exception:
        pass

    # 2. Stooq — free, no key, reliable daily OHLCV (US coverage). Sits right
    #    behind yfinance so when Yahoo is rate-limited we still get real
    #    candles/quotes instead of falling straight through to mock.
    try:
        from app.adapters.stooq_provider import StooqMarketProvider
        chain.append(StooqMarketProvider())
    except Exception:
        pass

    # 3. Finnhub — needs API key
    if settings.FINNHUB_API_KEY:
        try:
            from app.adapters.finnhub_provider import FinnhubMarketProvider
            chain.append(FinnhubMarketProvider())
        except Exception:
            pass

    # 4. Alpha Vantage — needs API key
    if settings.ALPHAVANTAGE_API_KEY:
        try:
            from app.adapters.alphavantage_provider import AlphaVantageMarketProvider
            chain.append(AlphaVantageMarketProvider())
        except Exception:
            pass

    return chain


def _build_news_chain() -> list[NewsProvider]:
    """Build ordered list of available news providers."""
    chain: list[NewsProvider] = []

    # 1. RSS — always available
    try:
        from app.adapters.live import RSSNewsProvider
        chain.append(RSSNewsProvider())
    except Exception:
        pass

    # 2. Finnhub news — needs API key
    if settings.FINNHUB_API_KEY:
        try:
            from app.adapters.finnhub_provider import FinnhubNewsProvider
            chain.append(FinnhubNewsProvider())
        except Exception:
            pass

    return chain


class FallbackMarketProvider(MarketDataProvider):
    """Tries each provider in order. Caches successful results in Redis."""
    name = "fallback"

    def __init__(self) -> None:
        self._chain = _build_market_chain()
        self._mock = MockMarketProvider()
        providers_str = " → ".join(p.name for p in self._chain) + " → mock"
        log.info("market.fallback.chain", providers=providers_str)

    async def _cache_get(self, key: str) -> str | None:
        try:
            return await get_redis().get(key)
        except Exception:
            return None

    async def _cache_set(self, key: str, value: str, ttl: int) -> None:
        try:
            await get_redis().set(key, value, ex=ttl)
        except Exception:
            pass

    async def quote(self, symbol: str) -> Quote:
        # Check cache first
        cache_key = f"quote:{symbol}"
        hit = await self._cache_get(cache_key)
        if hit:
            d = json.loads(hit)
            return Quote(
                symbol=d["symbol"], price=d["price"], change=d["change"],
                change_pct=d["change_pct"], volume=d["volume"],
                avg_volume=d["avg_volume"], market_cap=d.get("market_cap"),
                currency=d["currency"], market=d["market"],
                ts=datetime.fromisoformat(d["ts"]),
            )

        # Try each provider
        last_error = None
        for provider in self._chain:
            try:
                result = await provider.quote(symbol)
                # Only cache if it's real data (not mock fallback)
                if result.price > 0:
                    await self._cache_set(cache_key, json.dumps({
                        "symbol": result.symbol, "price": result.price,
                        "change": result.change, "change_pct": result.change_pct,
                        "volume": result.volume, "avg_volume": result.avg_volume,
                        "market_cap": result.market_cap, "currency": result.currency,
                        "market": result.market, "ts": result.ts.isoformat(),
                    }), QUOTE_TTL)
                    log.info("quote.success", symbol=symbol, provider=provider.name)
                    return result
            except Exception as e:
                last_error = e
                log.warning("quote.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        # All failed — mock as absolute last resort
        log.warning("quote.all_failed", symbol=symbol, error=str(last_error))
        return await self._mock.quote(symbol)

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        import asyncio
        # Fetch in parallel with a concurrency semaphore to avoid flooding
        sem = asyncio.Semaphore(3)  # Max 3 concurrent to stay under rate limits

        async def _get(s: str) -> Quote:
            async with sem:
                try:
                    # quote() already degrades through the provider chain to
                    # mock on any *raised* error, but a stalled connection
                    # (common on shared cloud IPs hitting Yahoo) doesn't raise
                    # -- it just never returns, hanging this whole bulk call
                    # forever with no per-symbol bound anywhere in the chain.
                    # Timeout must clear _run_yf's own worst case: 3 attempts
                    # x up to 8s socket timeout each + backoff between = ~29s
                    # before it falls through to its own internal mock. A
                    # shorter timeout here just cuts that off early and turns
                    # every rate-limited (but otherwise fine) symbol into a
                    # false failure.
                    return await asyncio.wait_for(self.quote(s), timeout=35)
                except asyncio.TimeoutError:
                    log.warning("quote.timeout", symbol=s)
                    return await self._mock.quote(s)

        return list(await asyncio.gather(*(_get(s) for s in symbols)))

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        cache_key = f"candles:{symbol}:{interval}:{lookback}"
        hit = await self._cache_get(cache_key)
        if hit:
            data = json.loads(hit)
            return [
                Candle(
                    ts=datetime.fromisoformat(c["ts"]),
                    open=c["open"], high=c["high"], low=c["low"],
                    close=c["close"], volume=c["volume"],
                )
                for c in data
            ]

        for provider in self._chain:
            try:
                result = await provider.candles(symbol, interval, lookback)
                if result:
                    await self._cache_set(cache_key, json.dumps([
                        {"ts": c.ts.isoformat(), "open": c.open, "high": c.high,
                         "low": c.low, "close": c.close, "volume": c.volume}
                        for c in result
                    ]), CANDLE_TTL)
                    log.info("candles.success", symbol=symbol, provider=provider.name)
                    return result
            except Exception as e:
                log.warning("candles.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        return await self._mock.candles(symbol, interval, lookback)

    async def profile(self, symbol: str) -> CompanyProfile:
        cache_key = f"profile:{symbol}"
        hit = await self._cache_get(cache_key)
        if hit:
            d = json.loads(hit)
            return CompanyProfile(
                symbol=d["symbol"], name=d["name"], sector=d["sector"],
                industry=d["industry"], market=d["market"],
                currency=d["currency"], market_cap=d.get("market_cap"),
                description=d.get("description", ""),
            )

        for provider in self._chain:
            try:
                result = await provider.profile(symbol)
                if result.name != symbol or result.sector != "Unknown":
                    await self._cache_set(cache_key, json.dumps({
                        "symbol": result.symbol, "name": result.name,
                        "sector": result.sector, "industry": result.industry,
                        "market": result.market, "currency": result.currency,
                        "market_cap": result.market_cap, "description": result.description,
                    }), PROFILE_TTL)
                    log.info("profile.success", symbol=symbol, provider=provider.name)
                    return result
            except Exception as e:
                log.warning("profile.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        return await self._mock.profile(symbol)

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])


class FallbackNewsProvider(NewsProvider):
    """Tries RSS → Finnhub → Mock for news."""
    name = "fallback"

    def __init__(self) -> None:
        self._chain = _build_news_chain()
        self._mock = MockNewsProvider()

    async def latest(self, symbol: str | None = None, limit: int = 20) -> list[NewsItem]:
        for provider in self._chain:
            try:
                result = await provider.latest(symbol, limit)
                if result:
                    return result
            except Exception as e:
                log.warning("news.fallthrough", provider=provider.name, error=str(e))

        return await self._mock.latest(symbol, limit)
