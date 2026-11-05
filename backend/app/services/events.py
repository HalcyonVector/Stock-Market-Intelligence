"""
Upcoming earnings / dividend dates per stock, from the ``events:v1`` key the
GitHub Actions job (scripts/sync_events.py) writes once a day.

One Redis GET per hour at most (memory cache), whatever the traffic.
"""
from __future__ import annotations

import json
import time
from datetime import date, timedelta

from app.core.redis import get_redis

KEY = "events:v1"
_TTL = 3600
_cache: dict = {"at": -1e9, "data": {}, "updated": None}


async def _load() -> dict:
    if time.monotonic() - _cache["at"] < _TTL:
        return _cache["data"]
    _cache["at"] = time.monotonic()
    try:
        raw = await get_redis().get(KEY)
        obj = json.loads(raw) if raw else {}
        _cache["data"] = obj.get("events") or {}
        _cache["updated"] = obj.get("updated")
    except Exception:  # noqa: BLE001 -- keep whatever we had
        pass
    return _cache["data"]


def _days_until(d: str | None, today: date) -> int | None:
    if not d:
        return None
    try:
        return (date.fromisoformat(d) - today).days
    except ValueError:
        return None


async def for_symbols(symbols: list[str], horizon_days: int = 90, today: date | None = None) -> dict:
    """Upcoming events (within ``horizon_days``) for each symbol, soonest first."""
    data = await _load()
    today = today or date.today()
    out = []
    for raw in symbols[:100]:
        sym = raw.strip().upper()
        ev = data.get(sym)
        if not ev:
            continue
        for kind, label in (("earnings", "Earnings"), ("ex_dividend", "Ex-dividend"), ("dividend", "Dividend paid")):
            days = _days_until(ev.get(kind), today)
            if days is None or days < 0 or days > horizon_days:
                continue
            item = {"symbol": sym, "type": kind, "label": label, "date": ev[kind], "days_until": days}
            if kind == "earnings" and ev.get("eps_estimate") is not None:
                item["eps_estimate"] = ev["eps_estimate"]
            out.append(item)
    out.sort(key=lambda e: (e["days_until"], e["symbol"]))
    return {"events": out, "updated": _cache["updated"],
            "horizon_end": (today + timedelta(days=horizon_days)).isoformat()}
