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

log = get_logger("services.sector")

SECTOR_CACHE_KEY = "sector:rotation:{market}"
SECTOR_TTL = 600  # 10 min


async def _fetch_symbol(s: str, sem: asyncio.Semaphore) -> dict | None:
    """Fetch profile + quote + candles for one symbol with timeout."""
    async with sem:
        try:
            profile, quote, candles = await asyncio.wait_for(
                asyncio.gather(
                    providers.market.profile(s),
                    providers.market.quote(s),
                    providers.market.candles(s, "1d", 30),
                ),
                timeout=10,
            )
            mom = momentum_score(build_inputs(quote, candles)).value
            return {
                "sector": profile.sector,
                