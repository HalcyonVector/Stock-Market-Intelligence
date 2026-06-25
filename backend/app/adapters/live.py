"""
Free-tier live providers.

These activate when DATA_MODE=live. Each gracefully degrades to mock data if its
dependency or credentials are missing, so the app NEVER hard-fails on a missing
key. Chosen sources are all free:
  - yfinance   : global quotes/candles/profiles, no key, covers US + IN (.NS)
  - feedparser : RSS news from public financial feeds, no key
  - praw       : Reddit, free app credentials
  - pytrends   : Google Trends, free (unofficial)
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Awaitable, Callable, TypeVar

from app.adapters.base import (
    Candle, CompanyProfile, MarketDataProvider, NewsItem, NewsProvider, Quote,
)
from app.adapters.mock import MockMarketProvider, MockNewsProvider, _UNIVERSE
from app.adapters.resilience import get_breaker, get_yf_session, is_rate_limit_error
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.live")

T = TypeVar("T")

_YF_MAX_RETRIES = 3


def _yf_symbol(symbol: str, market: str) -> str:
    # Indian tickers need the NSE suffix for yfinance.
    return f"{symbol}.NS" if market == "IN" and not symbol.endswith(".NS") else symbol


def _yf_ticker(yf_symbol: str):
    """Build a yfinance Ticker bound to the shared, large-pool session."""
    import yfinance as yf
    return yf.Ticker(yf_symbol, session=get_yf_session())


async def _run_yf(
    label: str,
    symbol: str,
    fetch: Callable[[], T],
    fallback: Callable[[], Awaitable[T]],
) -> T:
    """Run a synchronous yfinance fetch with circuit-breaker + 429 backoff.

    On an open breaker or exhausted retries, degrade to ``fallback`` (mock).
    Rate-limit errors (429) count toward the breaker and trigger exponential
    backoff with jitter; other errors degrade immediately.
    """
    breaker = get_breaker("yfinance", fail_threshold=4, cooldown=90)
    if not breaker.allow():
        log.warning("yfinance.skip_open", label=label, symbol=symbol)
        return await fallback()

    last_error: Exception | None = None
    for attempt in range(_YF_MAX_RETRIES):
        try:
            result = await asyncio.to_thread(fetch)
            breaker.record_success()
            return result
        except Exception as e:  # noqa: BLE001 - graceful degrade
            last_error = e
            if is_rate_limit_error(e):
                breaker.record_failure()
                if attempt < _YF_MAX_RETRIES - 1 and breaker.allow():
                    await asyncio.sleep(2 ** attempt + random.random())
                    continue
            break

    log.warning("yfinance.fallback", label=label, symbol=symbol, error=str(last_error))
    return await fallback()


class YFinanceMarketProvider(MarketDataProvider):
    """Wraps the synchronous yfinance lib in a threadpool."""
    name = "yfinance"

    def __init__(self) -> None:
        self._fallback = MockMarketProvider()

    async def quote(self, symbol: str) -> Quote:
        def _fetch() -> Quote:
            market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
            t = _yf_ticker(_yf_symbol(symbol, market))
            fi = t.fast_info
            # fast_info fields can be missing for thin/illiquid tickers.
            price = fi.get("last_price")
            if price is None:
                raise ValueError("no last_price")
            prev = fi.get("previous_close") or price
            vol = int(fi.get("last_volume") or 0)
            return Quote(
                symbol=symbol, price=round(price, 2),
                change=round(price - prev, 2),
                change_pct=round((price - prev) / prev * 100, 2) if prev else 0.0,
                volume=vol, avg_volume=int(fi.get("ten_day_average_volume") or vol or 1),
                market_cap=fi.get("market_cap"),
                currency=fi.get("currency", "USD"),
                market=market, ts=datetime.now(timezone.utc),
            )

        return await _run_yf("quote", symbol, _fetch, lambda: self._fallback.quote(symbol))

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        return await asyncio.gather(*(self.quote(s) for s in symbols))

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        def _fetch() -> list[Candle]:
            market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
            df = _yf_ticker(_yf_symbol(symbol, market)).history(
                period=f"{lookback}d", interval=interval
            )
            if df.empty:
                raise ValueError("no candle data")
            rows = []
            for ts, row in df.iterrows():
                rows.append(Candle(
                    ts=ts.to_pydatetime(), open=round(row.Open, 2),
                    high=round(row.High, 2), low=round(row.Low, 2),
                    close=round(row.Close, 2), volume=int(row.Volume),
                ))
            return rows

        return await _run_yf(
            "candles", symbol, _fetch,
            lambda: self._fallback.candles(symbol, interval, lookback),
        )

    async def profile(self, symbol: str) -> CompanyProfile:
        def _fetch() -> CompanyProfile:
            market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
            info = _yf_ticker(_yf_symbol(symbol, market)).info
            return CompanyProfile(
                symbol=symbol, name=info.get("shortName", symbol),
                sector=info.get("sector", "Unknown"),
                industry=info.get("industry", "Unknown"),
                market=market, currency=info.get("currency", "USD"),
                market_cap=info.get("marketCap"),
                description=info.get("longBusinessSummary", "")[:1000],
            )

        return await _run_yf("profile", symbol, _fetch, lambda: self._fallback.profile(symbol))

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])


class RSSNewsProvider(NewsProvider):
    """Public financial RSS feeds. No key required."""
    name = "rss"
    FEEDS = [
        "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
        "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        "https://www.moneycontrol.com/rss/marketreports.xml",      # India
        "https://www.business-standard.com/rss/markets-106.rss",   # India
        "https://feeds.reuters.com/reuters/businessNews",          # global
    ]

    def __init__(self) -> None:
        self._fallback = MockNewsProvider()

    async def latest(self, symbol: str | None = None, limit: int = 20) -> list[NewsItem]:
        try:
            import feedparser

            def _fetch() -> list[NewsItem]:
                items: list[NewsItem] = []
                for url in self.FEEDS:
                    feed = feedparser.parse(url)
                    for e in feed.entries[:limit]:
                        if symbol and symbol.lower() not in (e.get("title", "")).lower():
                            continue
                        items.append(NewsItem(
                            symbol=symbol, headline=e.get("title", ""),
                            url=e.get("link", ""), source=feed.feed.get("title", "RSS"),
                            published_at=datetime.now(timezone.utc),
                            summary=e.get("summary", "")[:300],
                        ))
                return items[:limit]

            items = await asyncio.to_thread(_fetch)
            return items or await self._fallback.latest(symbol, limit)
        except Exception as e:  # noqa: BLE001
            log.warning("rss.fallback", error=str(e))
            return await self._fallback.latest(symbol, limit)
