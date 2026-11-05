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
    fallback: Callable[[], Awaitable[T]] | None,
) -> T:
    """Run a synchronous yfinance fetch with circuit-breaker + 429 backoff.

    On an open breaker or exhausted retries, degrade to ``fallback`` -- or, when
    ``fallback`` is None, raise so the caller (FallbackMarketProvider) can try
    the next real provider instead of receiving mock data that looks real.
    Rate-limit errors (429) count toward the breaker and trigger exponential
    backoff with jitter; other errors degrade immediately.
    """
    breaker = get_breaker("yfinance", fail_threshold=4, cooldown=90)
    if not breaker.allow():
        log.warning("yfinance.skip_open", label=label, symbol=symbol)
        if fallback is None:
            raise RuntimeError("yfinance circuit breaker open")
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
    if fallback is None:
        raise RuntimeError(f"yfinance {label} failed: {last_error}")
    return await fallback()


class YFinanceMarketProvider(MarketDataProvider):
    """Wraps the synchronous yfinance lib in a threadpool."""
    name = "yfinance"

    def __init__(self, degrade_to_mock: bool = False) -> None:
        # Inside the fallback chain this must stay False: returning mock data
        # here made the chain log "quote.success provider=yfinance", cache the
        # mock as if it were real, and never try Stooq/Finnhub/Alpha Vantage.
        self._fallback = MockMarketProvider() if degrade_to_mock else None

    def _fb(self, make):
        return (lambda: make(self._fallback)) if self._fallback else None

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

        return await _run_yf("quote", symbol, _fetch, self._fb(lambda m: m.quote(symbol)))

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
            self._fb(lambda m: m.candles(symbol, interval, lookback)),
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

        return await _run_yf("profile", symbol, _fetch, self._fb(lambda m: m.profile(symbol)))

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])


class RSSNewsProvider(NewsProvider):
    """Public financial RSS feeds. No key required."""
    name = "rss"
    # Checked 2026-11: all return items. (feeds.reuters.com shut down in 2020.)
    FEEDS = [
        ("WSJ Markets", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"),
        ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
        ("CNBC Finance", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
        ("Economic Times", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
        ("Mint", "https://www.livemint.com/rss/markets"),
        ("Business Standard", "https://www.business-standard.com/rss/markets-106.rss"),
        ("Moneycontrol", "https://www.moneycontrol.com/rss/marketreports.xml"),
    ]

    def __init__(self) -> None:
        self._fallback = MockNewsProvider()

    async def latest(self, symbol: str | None = None, limit: int = 20) -> list[NewsItem]:
        try:
            import calendar

            import feedparser
            import httpx

            async def _get(client, url):
                try:
                    r = await client.get(url)
                    r.raise_for_status()
                    return r.content
                except Exception as e:  # noqa: BLE001 -- one dead feed shouldn't sink the rest
                    log.warning("rss.feed_failed", url=url, error=str(e)[:120])
                    return None

            async with httpx.AsyncClient(
                timeout=8, follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (StockIntel news reader)"},
            ) as client:
                bodies = await asyncio.gather(*(_get(client, u) for _, u in self.FEEDS))

            def _parse() -> list[NewsItem]:
                items: list[NewsItem] = []
                seen: set[str] = set()
                for (name, _), body in zip(self.FEEDS, bodies):
                    if not body:
                        continue
                    for e in feedparser.parse(body).entries[:limit]:
                        title = (e.get("title") or "").strip()
                        if not title or title.lower() in seen:
                            continue
                        if symbol and symbol.lower() not in title.lower():
                            continue
                        seen.add(title.lower())
                        t = e.get("published_parsed") or e.get("updated_parsed")
                        published = (datetime.fromtimestamp(calendar.timegm(t), tz=timezone.utc)
                                     if t else datetime.now(timezone.utc))
                        items.append(NewsItem(
                            symbol=symbol, headline=title, url=e.get("link", ""),
                            source=name, published_at=published,
                            summary=(e.get("summary") or "")[:300],
                        ))
                # Newest first across all feeds, so one busy feed doesn't
                # crowd out the others.
                items.sort(key=lambda n: n.published_at, reverse=True)
                return items[:limit]

            items = await asyncio.to_thread(_parse)
            return items or await self._fallback.latest(symbol, limit)
        except Exception as e:  # noqa: BLE001
            log.warning("rss.fallback", error=str(e))
            return await self._fallback.latest(symbol, limit)
