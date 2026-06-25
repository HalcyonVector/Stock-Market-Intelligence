"""
Stooq provider — free, no API key, no documented rate limit.

Stooq serves daily OHLCV as plain CSV, which makes it an excellent resilient
fallback for when Yahoo (yfinance) is rate-limited and the Finnhub candle
endpoint is paywalled. Coverage is strongest for US equities (``<ticker>.us``);
non-US markets (e.g. NSE ``.NS``) are not reliably available, so those degrade
to the next provider in the chain.

Endpoints used:
  * Daily history: https://stooq.com/q/d/l/?s=aapl.us&i=d  -> Date,Open,High,Low,Close,Volume

We derive the quote from the last two daily rows (last close + prior close),
which gives a correct change / change% without a separate request.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from app.adapters.base import Candle, CompanyProfile, MarketDataProvider, Quote
from app.adapters.mock import _UNIVERSE
from app.adapters.resilience import (
    get_async_client, get_breaker, is_rate_limit_error,
)
from app.core.logging import get_logger

log = get_logger("adapters.stooq")

BASE = "https://stooq.com/q/d/l/"


def _stooq_symbol(symbol: str, market: str) -> str:
    """Map our ticker to a Stooq symbol. Raises for unsupported markets."""
    if market == "IN" or symbol.endswith(".NS"):
        raise ValueError("stooq: NSE symbols not supported")
    # Stooq uses dots, not dashes (BRK-B -> brk.b), and a .us market suffix.
    s = symbol.lower().replace("-", ".")
    return f"{s}.us"


def _market_for(symbol: str) -> str:
    return next((m for m, s in _UNIVERSE.items() if symbol in s), "US")


class StooqMarketProvider(MarketDataProvider):
    name = "stooq"

    def _breaker(self):
        return get_breaker("stooq", fail_threshold=4, cooldown=120)

    async def _fetch_rows(self, symbol: str, market: str) -> list[dict]:
        breaker = self._breaker()
        breaker.guard()
        client = get_async_client("stooq")
        try:
            r = await client.get(BASE, params={"s": _stooq_symbol(symbol, market), "i": "d"})
            r.raise_for_status()
            text = r.text
        except Exception as e:
            if is_rate_limit_error(e):
                breaker.record_failure()
            raise

        # A bad symbol returns the literal "No data" body, not a CSV.
        if "No data" in text or "Date,Open" not in text:
            raise ValueError(f"stooq: no data for {symbol}")

        rows = list(csv.DictReader(io.StringIO(text)))
        if not rows:
            raise ValueError(f"stooq: empty series for {symbol}")
        breaker.record_success()
        return rows

    async def quote(self, symbol: str) -> Quote:
        market = _market_for(symbol)
        rows = await self._fetch_rows(symbol, market)
        last = rows[-1]
        prev = rows[-2] if len(rows) >= 2 else last
        price = float(last["Close"])
        prev_close = float(prev["Close"]) or price
        vols = [int(float(r["Volume"])) for r in rows[-10:] if r.get("Volume")]
        avg_vol = int(sum(vols) / len(vols)) if vols else 0
        return Quote(
            symbol=symbol, price=round(price, 2),
            change=round(price - prev_close, 2),
            change_pct=round((price - prev_close) / prev_close * 100, 2) if prev_close else 0.0,
            volume=int(float(last.get("Volume") or 0)),
            avg_volume=avg_vol or 1,
            market_cap=None,
            currency="USD",
            market=market,
            ts=datetime.now(timezone.utc),
        )

    async def quotes(self, symbols: list[str]) -> list[Quote]:
        out: list[Quote] = []
        for s in symbols:
            try:
                out.append(await self.quote(s))
            except Exception as e:  # noqa: BLE001
                log.warning("stooq.quote.skip", symbol=s, error=str(e))
        return out

    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]:
        # Stooq daily CSV only — intraday isn't reliably free, so only serve "1d".
        if interval not in ("1d", "1w"):
            raise ValueError(f"stooq: interval {interval} unsupported")
        market = _market_for(symbol)
        rows = await self._fetch_rows(symbol, market)
        out: list[Candle] = []
        for r in rows[-lookback:]:
            try:
                out.append(Candle(
                    ts=datetime.fromisoformat(r["Date"]).replace(tzinfo=timezone.utc),
                    open=round(float(r["Open"]), 2),
                    high=round(float(r["High"]), 2),
                    low=round(float(r["Low"]), 2),
                    close=round(float(r["Close"]), 2),
                    volume=int(float(r.get("Volume") or 0)),
                ))
            except (ValueError, KeyError):
                continue
        if not out:
            raise ValueError(f"stooq: no usable candles for {symbol}")
        return out

    async def profile(self, symbol: str) -> CompanyProfile:
        # Stooq carries no fundamentals/sector data — let the chain fall through.
        raise NotImplementedError("stooq has no profile data")

    async def universe(self, market: str) -> list[str]:
        return _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])
