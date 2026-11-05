"""
Fallback chain provider — tries each data source in order until one succeeds.

Order: yfinance (free, no key) → Finnhub (free, key) → Alpha Vantage (free, key)
       → Mock (always works, last resort)

Each call is Redis-cached so subsequent hits are instant. Cache TTL varies by
data type: quotes 5 min, candles 15 min, profiles 60 min.

Quotes for every symbol share ONE Redis key (``quotes:bulk:v1``), read at most
once a minute and written back at most every 30 s, instead of a GET + SET per
symbol per refresh. That is what keeps a larger stock universe inside Upstash's
500K commands/month.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from app.adapters.base import (
    Candle, CompanyProfile, MarketDataProvider, NewsItem, NewsProvider, Quote,
)
from app.adapters.mock import MockMarketProvider, MockNewsProvider, _UNIVERSE
from app.adapters.resilience import get_breaker
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("adapters.fallback")

# What actually served market data recently, surfaced on /health so a silent
# degrade to mock data is visible without reading logs.
market_status: dict = {
    "last_live_source": None, "last_live_at": None,
    "mock_served": 0, "last_mock_reason": None, "last_mock_at": None,
}


def _note_live(source: str) -> None:
    market_status["last_live_source"] = source
    market_status["last_live_at"] = datetime.now(timezone.utc).isoformat()


def _note_mock(kind: str, reason) -> None:
    market_status["mock_served"] += 1
    market_status["last_mock_at"] = datetime.now(timezone.utc).isoformat()
    market_status["last_mock_reason"] = f"{kind}: {str(reason)[:200]}" if reason else kind

# Cache TTLs in seconds
QUOTE_TTL = 300       # 5 minutes
CANDLE_TTL = 900      # 15 minutes (intraday intervals)
# Daily bars only change once a day; caching them for 12 h is what keeps
# Twelve Data's free 800 credits/day sufficient.
DAILY_CANDLE_TTL = 12 * 3600
PROFILE_TTL = 3600    # 1 hour

# Shared quote blob (see module docstring).
BULK_KEY = "quotes:bulk:v1"
BULK_READ_EVERY = 60      # s between Redis reads of the blob
BULK_WRITE_EVERY = 30     # s between Redis writes of the blob
BULK_KEEP = 24 * 3600     # drop entries older than this when writing
_bulk: dict = {"read_at": -1e9, "written_at": -1e9, "dirty": False, "data": {}}

# End-of-day quotes built from the daily history snapshot only change when the
# GitHub Actions sync runs (twice a day), so keep them in memory for a while
# instead of re-reading a ~20 KB history entry from Redis on every scan.
EOD_TTL = 3 * 3600
EOD_MISS_TTL = 1800
_eod_cache: dict[str, tuple[float, object]] = {}

# Same breaker instance as app.core.snapshot's -- once Upstash's monthly
# command quota is exhausted, every GET/SET here would otherwise still be
# attempted (and fail) for every symbol on every scan. Long cooldown: a
# quota-exhausted plan stays exhausted until the monthly reset, not until the
# next network blip clears.
_redis_breaker = get_breaker("redis.snapshot", fail_threshold=2, cooldown=600.0)

# In-process cache in front of the Redis cache. discovery.scan, sector.rotation,
# heatmap.get_heatmap_data, market.compute_movers and the periodic refresh loop
# each independently walk the whole ~115-symbol universe calling quote()/candles()
# per symbol -- five separate full sweeps that used to each pay a Redis GET (+ a
# SET on miss) per symbol, even when two of those sweeps ran seconds apart (e.g.
# /health/warm staggers its six kicks by only 3s). This was most of the Upstash
# command budget: ~115 symbols x ~4 Redis ops x up to 5 independent scans per
# warm cycle. A short-lived process-local cache means only the *first* scan to
# touch a symbol in a given window pays Redis at all; every sibling scan within
# _LOCAL_TTL reuses that result for free. Deliberately shorter than the Redis
# TTLs above -- this is just for collapsing near-simultaneous sweeps, not a
# replacement for the durable cache.
_LOCAL_TTL = 120
_local_cache: dict[str, tuple[float, object]] = {}


def _local_get(key: str):
    hit = _local_cache.get(key)
    if hit is None:
        return None
    ts, value = hit
    if time.monotonic() - ts > _LOCAL_TTL:
        _local_cache.pop(key, None)
        return None
    return value


def _local_set(key: str, value) -> None:
    _local_cache[key] = (time.monotonic(), value)
    # Cheap unbounded-growth guard -- the universe is ~100-200 symbols across a
    # handful of cache kinds, so this should rarely trip, but a stuck process
    # over days shouldn't grow this forever.
    if len(_local_cache) > 5000:
        cutoff = time.monotonic() - _LOCAL_TTL
        for k, (ts, _) in list(_local_cache.items()):
            if ts < cutoff:
                _local_cache.pop(k, None)


def _build_market_chain() -> list[MarketDataProvider]:
    """Build ordered list of available market providers."""
    chain: list[MarketDataProvider] = []

    # 1. yfinance — always available (no key needed)
    try:
        from app.adapters.live import YFinanceMarketProvider
        chain.append(YFinanceMarketProvider())
    except Exception:
        pass

    # 2. Stooq used to sit here, but its CSV download now sits behind a
    #    JavaScript bot check, so every request returned an HTML page and
    #    failed. Re-enable with STOOQ_ENABLED=true if that ever changes.
    if settings.STOOQ_ENABLED:
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

    # 4. Twelve Data — needs API key; daily candles for US stocks only.
    if settings.TWELVEDATA_API_KEY:
        try:
            from app.adapters.twelvedata_provider import TwelveDataMarketProvider
            chain.append(TwelveDataMarketProvider())
        except Exception:
            pass

    # 5. Alpha Vantage — needs API key
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
        if not _redis_breaker.allow():
            return None
        try:
            result = await get_redis().get(key)
        except Exception:
            _redis_breaker.record_failure()
            return None
        _redis_breaker.record_success()
        return result

    async def _cache_set(self, key: str, value: str, ttl: int) -> None:
        if not _redis_breaker.allow():
            return
        try:
            await get_redis().set(key, value, ex=ttl)
        except Exception:
            _redis_breaker.record_failure()
            return
        _redis_breaker.record_success()

    async def quote(self, symbol: str) -> Quote:
        # Process-local cache first -- collapses near-simultaneous scans
        # (discovery/sector/heatmap/movers) onto a single Redis round trip.
        local_key = f"quote:{symbol}"
        local_hit = _local_get(local_key)
        if local_hit is not None:
            return local_hit

        # Shared Redis quote blob next
        await self._bulk_load()
        result = self._bulk_get(symbol)
        if result is not None:
            _local_set(local_key, result)
            return result

        # NSE stocks: none of the free quote APIs (Finnhub / Twelve Data /
        # Alpha Vantage) cover them and Yahoo blocks Render, so use the
        # end-of-day quote from the daily history snapshot first -- and don't
        # burn other providers' credits on calls that can't succeed.
        from app.adapters import history_store

        indian = history_store.is_indian(symbol)
        if indian:
            snap = await self._snapshot_quote(symbol)
            if snap is not None:
                _local_set(local_key, snap)
                return snap

        # Try each provider
        last_error = None
        for provider in self._chain:
            try:
                result = await provider.quote(symbol)
                # Only cache if it's real data (not mock fallback)
                if result.price > 0:
                    if not result.volume or not result.avg_volume:
                        await self._fill_volume(result)
                    self._bulk_put(result)
                    await self._bulk_flush()
                    _local_set(local_key, result)
                    log.info("quote.success", symbol=symbol, provider=provider.name)
                    _note_live(provider.name)
                    return result
            except Exception as e:
                last_error = e
                log.warning("quote.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        # US stocks: last real-data option is yesterday's close from the snapshot.
        if not indian:
            snap = await self._snapshot_quote(symbol)
            if snap is not None:
                _local_set(local_key, snap)
                return snap

        # All failed — mock as absolute last resort
        log.warning("quote.all_failed", symbol=symbol, error=str(last_error))
        _note_mock("quote", last_error)
        return await self._mock.quote(symbol)

    async def _eod(self, symbol: str) -> Quote | None:
        """Last daily close from the history snapshot (memory-cached)."""
        from app.adapters import history_store

        sym = symbol.upper()
        hit = _eod_cache.get(sym)
        if hit is not None and time.monotonic() < hit[0]:
            return hit[1]
        raw = await self._cache_get(history_store.KEY.format(symbol=sym))
        q = history_store.latest_quote(raw, symbol) if raw else None
        _eod_cache[sym] = (time.monotonic() + (EOD_TTL if q else EOD_MISS_TTL), q)
        return q

    async def _snapshot_quote(self, symbol: str) -> Quote | None:
        q = await self._eod(symbol)
        if q is None:
            return None
        _note_live("history_snapshot_eod")
        return Quote(**q.__dict__)  # a copy: callers may mutate it

    async def _fill_volume(self, q: Quote) -> None:
        """Finnhub's free quote has no volume. Use the last session's volume and
        the 20-day average from the daily history, so volume ratios and
        unusual-activity events work for US stocks."""
        eod = await self._eod(q.symbol)
        if eod is None:
            return
        q.volume = q.volume or eod.volume
        q.avg_volume = q.avg_volume or eod.avg_volume

    # ---------------------------------------------------- shared quote blob
    async def _bulk_load(self) -> None:
        now = time.monotonic()
        if now - _bulk["read_at"] < BULK_READ_EVERY:
            return
        _bulk["read_at"] = now
        raw = await self._cache_get(BULK_KEY)
        if not raw:
            return
        try:
            remote = json.loads(raw)
        except Exception:  # noqa: BLE001 -- corrupt blob: ignore, it gets rewritten
            return
        data = _bulk["data"]
        for sym, entry in remote.items():
            mine = data.get(sym)
            if mine is None or entry.get("at", 0) > mine.get("at", 0):
                data[sym] = entry

    def _bulk_get(self, symbol: str) -> Quote | None:
        entry = _bulk["data"].get(symbol)
        if not entry or time.time() - entry.get("at", 0) > QUOTE_TTL:
            return None
        try:
            d = dict(entry["q"])
            d["ts"] = datetime.fromisoformat(d["ts"])
            return Quote(**d)
        except Exception:  # noqa: BLE001
            return None

    def _bulk_put(self, q: Quote) -> None:
        d = dict(q.__dict__)
        d["ts"] = q.ts.isoformat()
        _bulk["data"][q.symbol] = {"at": time.time(), "q": d}
        _bulk["dirty"] = True

    async def _bulk_flush(self, force: bool = False) -> None:
        now = time.monotonic()
        if not _bulk["dirty"] or (not force and now - _bulk["written_at"] < BULK_WRITE_EVERY):
            return
        cutoff = time.time() - BULK_KEEP
        _bulk["data"] = {s: e for s, e in _bulk["data"].items() if e.get("at", 0) >= cutoff}
        _bulk["written_at"] = now
        _bulk["dirty"] = False
        await self._cache_set(BULK_KEY, json.dumps(_bulk["data"], separators=(",", ":")), BULK_KEEP)

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
                    _note_mock("quote", "timeout")
                    return await self._mock.quote(s)

        out = list(await asyncio.gather(*(_get(s) for s in symbols)))
        await self._bulk_flush(force=True)  # one write for the whole batch
        return out

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        local_key = f"candles:{symbol}:{interval}:{lookback}"
        local_hit = _local_get(local_key)
        if local_hit is not None:
            return local_hit

        # 1. Daily history written by the GitHub Actions sync job (US + NSE).
        if interval == "1d":
            from app.adapters import history_store

            raw = await self._cache_get(history_store.KEY.format(symbol=symbol.upper()))
            snap = history_store.decode(raw, lookback) if raw else None
            if snap:
                _local_set(local_key, snap)
                _note_live("history_snapshot")
                return snap

        cache_key = f"candles:{symbol}:{interval}:{lookback}"
        hit = await self._cache_get(cache_key)
        if hit:
            data = json.loads(hit)
            result = [
                Candle(
                    ts=datetime.fromisoformat(c["ts"]),
                    open=c["open"], high=c["high"], low=c["low"],
                    close=c["close"], volume=c["volume"],
                )
                for c in data
            ]
            _local_set(local_key, result)
            return result

        for provider in self._chain:
            try:
                result = await provider.candles(symbol, interval, lookback)
                if result:
                    await self._cache_set(cache_key, json.dumps([
                        {"ts": c.ts.isoformat(), "open": c.open, "high": c.high,
                         "low": c.low, "close": c.close, "volume": c.volume}
                        for c in result
                    ]), DAILY_CANDLE_TTL if interval == "1d" else CANDLE_TTL)
                    _local_set(local_key, result)
                    log.info("candles.success", symbol=symbol, provider=provider.name)
                    _note_live(provider.name)
                    return result
            except Exception as e:
                log.warning("candles.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        _note_mock("candles", None)
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
                    _note_live(provider.name)
                    return result
            except Exception as e:
                log.warning("profile.fallthrough", symbol=symbol, provider=provider.name, error=str(e))

        _note_mock("profile", None)
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
