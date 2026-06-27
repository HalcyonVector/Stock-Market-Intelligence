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
# 24 h — Celery beat overwrites this on its own schedule (every ~48 min during
# market hours, up to ~9.6 h on weekends with the 12x backoff). The TTL just
# needs to outlast the worst-case gap so the cache never expires between runs
# and triggers slow inline computation on the API request path.
SECTOR_TTL = 86_400  # 24 h

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
    """API-facing — reads from cache; falls back to inline compute on miss.

    The startup cache warm (in main.py lifespan) normally ensures the cache is
    hot before the first browser request.  If the cache is still cold (e.g.
    startup warm hasn't finished yet), we compute inline so the user sees data
    instead of an empty card.
    """
    key = SECTOR_CACHE_KEY.format(market=market)
    try:
        hit = await get_redis().get(key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    # Cache miss — compute inline (guarded against concurrent duplicates).
    if market not in _inflight:
        _inflight.add(market)
        try:
            return await compute_rotation(market)
        finally:
            _inflight.discard(market)

    # Another request is already computing — wait briefly for it to land.
    for _ in range(10):
        await asyncio.sleep(1)
        try:
            hit = await get_redis().get(key)
            if hit:
                return json.loads(hit)
        except Exception:
            pass
    return []
