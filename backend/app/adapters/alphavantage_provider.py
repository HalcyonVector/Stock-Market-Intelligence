"""
Alpha Vantage provider — free tier: 25 calls/day (500 with premium key).

Last-resort fallback. Only used when yfinance AND Finnhub fail.
Requires ALPHAVANTAGE_API_KEY in env.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.adapters.base import (
    Candle, CompanyProfile, MarketDataProvider, Quote,
)
from app.adapters.mock import _UNIVERSE
from app.adapters.resilience import get_async_client, get_breaker
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.alphavantage")

BASE = "https://www.alphavantage.co/query"

# Free tier is 25 requests/day. Once exhausted, AV returns an "Information" or
# "Note" message instead of data. Re-requesting just burns latency and pollutes
# logs, so we trip a long breaker (6h) the moment we see such a message.
_AV_QUOTA_COOLDOWN = 6 * 3600


def _av_breaker():
    return get_breaker("alphavantage", fail_threshold=2, cooldown=_AV_QUOTA_COOLDOWN)


def _check_quota(data: dict) -> None:
    """Trip the breaker if AV returned a rate-limit / quota message."""
    if not isinstance(data, dict):
        return
    msg = data.get("Note") or data.get("Information") or data.get("Error Message")
    if msg and any(k in msg.lower() for k in
                   ("frequency", "thank you", "25 requests", "premium", "rate limit")):
        _av_breaker().trip(cooldown=_AV_QUOTA_COOLDOWN)
        raise ValueError(f"Alpha Vantage quota hit: {msg[:80]}")


class AlphaVantageMarketProvider(MarketDataProvider):
    name = "alphavantage"

    async def quote(self, symbol: str) -> Quote:
        _av_breaker().guard()
        client = get_async_client("alphavantage", timeout=15)
        r = await client.get(BASE, params={
            "function": "GLOBAL_QUOTE",
            "symbol": symbol,
            "apikey": settings.ALPHAVANTAGE_API_KEY,
        })
        r.raise_for_status()
        data = r.json()
        _check_quota(data)

        gq = data.get("Global Quote", {})
        price = float(gq.get("05. price", 0))
        if not price:
            raise ValueError(f"Alpha Vantage returned no price for {symbol}")

        prev = float(gq.get("08. previous close", price) or price)
        market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")

        return Quote(
            symbol=symbol, price=round(price, 2),
            change=round(float(gq.get("09. change", 0) or 0), 2),
            change_pct=round(float(gq.get("10. change percent", "0").replace("%", "") or 0), 2),
            volume=int(gq.get("06. volume", 0) or 0),
            avg_volume=0,
            market_cap=None,
            currency="USD",
            market=market,
            ts=datetime.now(timezone.utc),
        )

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        results = []
        for sym in symbols:
            try:
                results.append(await self.quote(sym))
                await asyncio.sleep(1)  # Very aggressive rate limit on free tier
            except Exception as e:
                log.warning("alphavantage.quote.skip", symbol=sym, error=str(e))
        return results

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        func = "TIME_SERIES_DAILY" if interval in ("1d", "1w") else "TIME_SERIES_INTRADAY"
        params: dict = {
            "function": func,
            "symbol": symbol,
            "apikey": settings.ALPHAVANTAGE_API_KEY,
            "outputsize": "compact" if lookback <= 100 else "full",
        }
        if func == "TIME_SERIES_INTRADAY":
            av_interval = {"5m": "5min", "15m": "15min", "1h": "60min"}.get(interval, "60min")
            params["interval"] = av_interval

        _av_breaker().guard()
        client = get_async_client("alphavantage", timeout=15)
        r = await client.get(BASE, params=params)
        r.raise_for_status()
        data = r.json()
        _check_quota(data)

        # Alpha Vantage nests data under varying keys
        ts_key = next((k for k in data if "Time Series" in k), None)
        if not ts_key:
            raise ValueError(f"Alpha Vantage: no time series in response")

        candles = []
        for date_str, ohlcv in list(data[ts_key].items())[:lookback]:
            candles.append(Candle(
                ts=datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc),
                open=round(float(ohlcv.get("1. open", 0)), 2),
                high=round(float(ohlcv.get("2. high", 0)), 2),
                low=round(float(ohlcv.get("3. low", 0)), 2),
                close=round(float(ohlcv.get("4. close", 0)), 2),
                volume=int(float(ohlcv.get("5. volume", 0))),
            ))
        candles.reverse()  # AV returns newest first
        return candles

    async def profile(self, symbol: str) -> CompanyProfile:
        _av_breaker().guard()
        client = get_async_client("alphavantage", timeout=15)
        r = await client.get(BASE, params={
            "function": "OVERVIEW",
            "symbol": symbol,
            "apikey": settings.ALPHAVANTAGE_API_KEY,
        })
        r.raise_for_status()
        d = r.json()
        _check_quota(d)

        market = next((m for m, s in _UNIVERSE.items() if symbol in s), "US")
        return CompanyProfile(
            symbol=symbol,
            name=d.get("Name", symbol),
            sector=d.get("Sector", "Unknown"),
            industry=d.get("Industry", "Unknown"),
            market=market,
            currency=d.get("Currency", "USD"),
            market_cap=float(d["MarketCapitalization"]) if d.get("MarketCapitalization") else None,
            description=d.get("Description", "")[:1000],
        )

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])
