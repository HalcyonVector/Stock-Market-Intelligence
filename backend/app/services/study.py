"""
Market Study: the README's findings, recomputed weekly by GitHub Actions
(`scripts/market_findings.py --store`) and stored as one Redis key. The API
only reads it (at most one Redis GET an hour per server).
"""
from __future__ import annotations

import asyncio
import json
import time

from app.core.redis import get_redis

KEY = "study:v1"
_TTL = 3600
_cache: dict = {"at": -1e9, "data": None}


async def get_study() -> dict | None:
    if time.monotonic() - _cache["at"] < _TTL and _cache["data"] is not None:
        return _cache["data"]
    try:
        raw = await asyncio.wait_for(get_redis().get(KEY), timeout=3)
    except Exception:  # noqa: BLE001
        return _cache["data"]
    _cache["at"] = time.monotonic()
    _cache["data"] = json.loads(raw) if raw else None
    return _cache["data"]
