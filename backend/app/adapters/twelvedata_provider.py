"""
Twelve Data provider — daily candles for US stocks (free plan).

Free plan: 800 API credits/day and 8/minute (one ``time_series`` call = 1
credit). It's used only for price *history*, and only for symbols the daily
GitHub Actions snapshot (see ``history_store``) doesn't already cover, so in
normal operation it costs a handful of credits a day. Quotes stay on Finnhub
to save credits. NSE symbols are skipped (not on the free plan).

Requires TWELVEDATA_API_KEY.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

import httpx

from app.adapters.base import Candle, CompanyProfile, MarketDataProvider, Quote
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.twelvedata")

BASE = "https://api.twelvedata.com"
_INTERVALS = {"1d": "1day", "1wk": "1week", "1h": "1h", "30m": "30min", "15m": "15min", "5m": "5min"}

# Stay under the free limits with some headroom.
PER_MINUTE = 7
PER_DAY = 750


class _Budget:
    """Process-wide request pacing: <= PER_MINUTE per rolling minute, PER_DAY per UTC day."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._recent: list[float] = []
        self._day = ""
        self._used_today = 0

    async def take(self) -> None:
        async with self._lock:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if today != self._day:
                self._day, self._used_today = today, 0
            if self._used_today >= PER_DAY:
                raise RuntimeError("twelvedata: daily credit budget used up")
            now = time.monotonic()
            self._recent = [t for t in self._recent if now - t < 60]
            if len(self._recent) >= PER_MINUTE:
                wait = 60 - (now - self._recent[0]) + 0.1
                # Don't park a request for most of a minute; let the chain
                # fall through and try again on the next refresh instead.
                if wait > 20:
                    raise RuntimeError("twelvedata: per-minute limit reached")
                await asyncio.sleep(wait)
                self._recent = [t for t in self._recent if time.monotonic() - t < 60]
            self._recent.append(time.monotonic())
            self._used_today += 1


_budget = _Budget()


class TwelveDataMarketProvider(MarketDataProvider):
    name = "twelvedata"

    async def quote(self, symbol: str) -> Quote:
        raise NotImplementedError("twelvedata is used for history only (quotes come from Finnhub)")

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        raise NotImplementedError("twelvedata is used for history only")

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        if symbol.upper().endswith((".NS", ".BO")) or _is_indian(symbol):
            raise ValueError("twelvedata: NSE symbols not on the free plan")
        td_interval = _INTERVALS.get(interval)
        if td_interval is None:
            raise ValueError(f"twelvedata: interval {interval} unsupported")
        # lookback is in calendar days; ~252 trading days a year.
        outputsize = max(30, min(5000, int(lookback * 252 / 365) + 5)) if interval == "1d" else 500

        await _budget.take()
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BASE}/time_series", params={
                "symbol": symbol, "interval": td_interval, "outputsize": outputsize,
                "apikey": settings.TWELVEDATA_API_KEY, "order": "ASC",
            })
            r.raise_for_status()
            d = r.json()
        if d.get("status") != "ok":
            raise ValueError(f"twelvedata: {d.get('code')} {d.get('message', '')[:120]}")

        out = []
        for v in d.get("values", []):
            ts = datetime.fromisoformat(v["datetime"])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            out.append(Candle(
                ts=ts, open=float(v["open"]), high=float(v["high"]), low=float(v["low"]),
                close=float(v["close"]), volume=int(float(v.get("volume") or 0)),
            ))
        if not out:
            raise ValueError(f"twelvedata: no candles for {symbol}")
        return out

    async def profile(self, symbol: str) -> CompanyProfile:
        raise NotImplementedError("twelvedata profile not used")

    async def universe(self, market: str) -> list[str]:
        from app.adapters.mock import _UNIVERSE

        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])


def _is_indian(symbol: str) -> bool:
    from app.adapters.mock import _UNIVERSE

    return symbol in _UNIVERSE.get("IN", []) and symbol not in _UNIVERSE.get("US", [])
