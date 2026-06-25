"""Sector rotation — aggregate symbol flows into sector momentum/in-out flows.

Pre-computed by Celery beat and cached in Redis. The API reads from cache
for instant response; the heavy computation runs in the background.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from app.adapters.registry import providers
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.scoring.indicators import build_inputs
from app.scoring.engine import momentum_score
from app.services.heatmap import SECTOR_MAP

log = get_logger("services.sector")

SECTOR_CACHE_KEY = "sector:rotation:{market}"
SECTOR_TTL = 600  # 10 min

# Tracks markets currently being recomputed in the background so a burst of
# cache-miss requests doesn't spawn duplicate heavy computations.
_inflight: set[str] = set()


async def _fetch_symbol(s: str, sem: asyncio.Semaphore) -> dict | None:
    """Fetch quote + candles for one symbol with a timeout.

    Sector comes from the static SECTOR_MAP (sectors effectively never change),
    which avoids a per-symbol yfinance ``.info`` call — the single biggest source
    of the 429 storm, since one rotation scan otherwise fired ~100 of them.
    """
    async with sem:
        try:
            quote, candles = await asyncio.wait_for(
                asyncio.gather(
                    providers.market.quote(s),
                    providers.market.candles(s, "1d", 30),
                ),
                timeout=10,
            )
            mom = momentum_score(build_inputs(quote, candles)).value
            return {
                "sector": SECTOR_MAP.get(s, "Other"),
                "momentum": mom,
                "flow": quote.change_pct * (quote.market_cap or 1) / 1e9,
            }
        except Exception as e:
            log.warning("sector.symbol.skip", symbol=s, error=str(e))
            return None


async def compute_rotation(market: str = "GLOBAL") -> list[dict]:
    """Heavy computation — called by Celery beat, not by API directly."""
    syms = await providers.market.universe(market)
    sem = asyncio.Semaphore(5)
    results = await asyncio.gather(*(_fetch_symbol(s, sem) for s in syms))

    by_sector: dict[str, list[float]] = defaultdict(list)
    flow: dict[str, float] = defaultdict(float)
    for r in results:
        if r is None:
            continue
        by_sector[r["sector"]].append(r["momentum"])
        flow[r["sector"]] += r["flow"]

    out = []
    for sector, moms in by_sector.items():
        out.append({
            "sector": sector,
            "momentum": round(sum(moms) / len(moms), 1),
            "net_flow": round(flow[sector], 2),
            "constituents": len(moms),
            "direction": "inflow" if flow[sector] >= 0 else "outflow",
            "avg_change": round(sum(moms) / len(moms), 1),
        })
    out.sort(key=lambda x: x["momentum"], reverse=True)

    # Cache the result
    try:
        key = SECTOR_CACHE_KEY.format(market=market)
        await get_redis().set(key, json.dumps(out), ex=SECTOR_TTL)
        log.info("sector.cached", market=market, sectors=len(out))
    except Exception:
        pass

    return out


async def _compute_and_clear(market: str) -> None:
    try:
        await compute_rotation(market)
    finally:
        _inflight.discard(market)


async def rotation(market: str = "GLOBAL") -> list[dict]:
    """API-facing — reads from cache; never blocks the request on a live scan.

    On a cache miss we kick a single background recompute and return immediately
    (empty until it lands). Computing inline meant one request fanned out to ~100
    upstream calls and routinely outlived the web proxy timeout, producing the
    ``socket hang up`` / ECONNRESET errors seen in the logs. Celery beat keeps the
    cache warm in steady state; this just handles the cold-start gap gracefully.
    """
    key = SECTOR_CACHE_KEY.format(market=market)
    try:
        hit = await get_redis().get(key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    # Cache miss — trigger one background recompute, return what we have (nothing).
    if market not in _inflight:
        _inflight.add(market)
        try:
            asyncio.create_task(_compute_and_clear(market))
        except RuntimeError:
            # No running event loop (sync/test context) — compute inline instead.
            _inflight.discard(market)
            return await compute_rotation(market)
    return []
