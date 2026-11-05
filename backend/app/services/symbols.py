"""
Ticker search and "extra" symbols.

Search covers any listed stock, not just the ~160 the dashboards scan: the
scan universe is matched locally, everything else comes from Finnhub's free
symbol search (60 calls/min; results are memory-cached for a day and the
route is edge-cached too).

A stock someone adds to a watchlist, alert or paper trade that isn't in the
scan universe is recorded in the Redis set ``hist:extra``. The daily GitHub
Actions history sync fetches those too, so NSE stocks outside the universe get
real end-of-day prices and charts. The set is capped (``MAX_EXTRA``) so the
sync and the Redis budget stay bounded: each extra costs ~2 Upstash commands
a day.
"""
from __future__ import annotations

import re
import time

import httpx

from app.adapters.mock import _UNIVERSE
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("services.symbols")

EXTRA_KEY = "hist:extra"
MAX_EXTRA = 300
_VALID = re.compile(r"^[A-Z0-9][A-Z0-9&\-]{0,14}(\.(NS|BO))?$")

_search_cache: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_TTL = 24 * 3600
_registered: set[str] = set()


def normalize(symbol: str) -> str:
    return symbol.strip().upper()


def is_valid(symbol: str) -> bool:
    return bool(_VALID.match(normalize(symbol)))


def in_universe(symbol: str) -> bool:
    s = normalize(symbol)
    return any(s in syms for syms in _UNIVERSE.values())


def _market_of(symbol: str) -> str:
    s = normalize(symbol)
    if s.endswith((".NS", ".BO")) or (s in _UNIVERSE.get("IN", []) and s not in _UNIVERSE.get("US", [])):
        return "IN"
    return "US"


def _local_matches(q: str, limit: int) -> list[dict]:
    seen: set[str] = set()
    out = []
    for syms in _UNIVERSE.values():
        for s in syms:
            if s.startswith(q) and s not in seen:
                seen.add(s)
                out.append({"symbol": s, "name": "", "market": _market_of(s), "tracked": True})
    out.sort(key=lambda r: (r["symbol"] != q, len(r["symbol"]), r["symbol"]))
    return out[:limit]


async def _finnhub_search(q: str) -> list[dict]:
    if not settings.FINNHUB_API_KEY:
        return []
    hit = _search_cache.get(q)
    if hit and time.monotonic() - hit[0] < _SEARCH_TTL:
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://finnhub.io/api/v1/search", params={"q": q},
                headers={"X-Finnhub-Token": settings.FINNHUB_API_KEY},
            )
            r.raise_for_status()
            rows = r.json().get("result") or []
    except Exception as e:  # noqa: BLE001
        log.warning("symbols.search_failed", q=q, error=str(e)[:160])
        return []
    out = []
    for row in rows:
        sym = normalize(row.get("symbol") or "")
        kind = (row.get("type") or "").lower()
        # Plain US tickers and NSE/BSE listings only: those are the ones the
        # free data sources can actually price.
        if not is_valid(sym) or ("." in sym and not sym.endswith((".NS", ".BO"))):
            continue
        if kind and kind not in ("common stock", "etp", "etf", "adr"):
            continue
        if sym.endswith(".NS") and in_universe(sym[:-3]):
            continue  # already listed as the tracked NSE symbol (no suffix)
        out.append({
            "symbol": sym, "name": (row.get("description") or "").title(),
            "market": _market_of(sym), "tracked": in_universe(sym),
        })
    _search_cache[q] = (time.monotonic(), out)
    if len(_search_cache) > 2000:
        _search_cache.clear()
    return out


async def search(q: str, limit: int = 12) -> list[dict]:
    q = normalize(q)[:20]
    if not q:
        return []
    results = _local_matches(q, limit)
    seen = {r["symbol"] for r in results}
    for row in await _finnhub_search(q):
        if row["symbol"] not in seen:
            seen.add(row["symbol"])
            results.append(row)
    return results[:limit]


async def register_extra(symbol: str) -> None:
    """Ask the daily history sync to fetch a stock outside the scan universe.
    Best-effort: never fails the caller."""
    s = normalize(symbol)
    if s in _registered or in_universe(s) or not is_valid(s):
        return
    try:
        r = get_redis()
        if await r.sismember(EXTRA_KEY, s):
            _registered.add(s)
            return
        if await r.scard(EXTRA_KEY) >= MAX_EXTRA:
            log.warning("symbols.extra_full", symbol=s)
            return
        await r.sadd(EXTRA_KEY, s)
        _registered.add(s)
        log.info("symbols.extra_added", symbol=s)
    except Exception as e:  # noqa: BLE001
        log.warning("symbols.extra_failed", symbol=s, error=str(e)[:160])
