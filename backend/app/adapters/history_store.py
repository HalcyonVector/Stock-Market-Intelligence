"""
Daily price history kept in Redis by an off-box job.

Render's IPs are blocked by Yahoo, so the backend can't fetch history with
yfinance itself. A scheduled GitHub Actions workflow (free for this public
repo) runs ``scripts/sync_history.py`` once a day, fetches ~400 days of daily
bars for the whole universe (US *and* NSE) with yfinance, and writes them here.
The backend reads these first and only falls back to API providers (Twelve
Data, ...) for symbols the job couldn't fetch.

Format: key ``hist:1d:{SYMBOL}`` (the app's own symbol, e.g. ``HCLTECH`` not
``HCLTECH.NS``) -> JSON ``{"updated": iso8601, "bars": [[date, o, h, l, c, v], ...]}``
oldest first. No TTL: the job overwrites daily, and stale data is rejected on
read via ``MAX_AGE_DAYS``.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.adapters.base import Candle

KEY = "hist:1d:{symbol}"
# A long weekend + one failed run is ~4 days; older than this, don't trust it.
MAX_AGE_DAYS = 5


def encode(bars: list[Candle]) -> str:
    return json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(),
        "bars": [
            [c.ts.date().isoformat() if isinstance(c.ts, datetime) else str(c.ts)[:10],
             round(c.open, 4), round(c.high, 4), round(c.low, 4), round(c.close, 4), int(c.volume)]
            for c in bars
        ],
    }, separators=(",", ":"))


def decode(raw: str, lookback_days: int, now: datetime | None = None) -> list[Candle] | None:
    """Return the last ``lookback_days`` calendar days of bars, or None if stale/empty."""
    now = now or datetime.now(timezone.utc)
    try:
        obj = json.loads(raw)
        updated = datetime.fromisoformat(obj["updated"])
        bars = obj["bars"]
    except Exception:  # noqa: BLE001 -- corrupt entry: treat as missing
        return None
    if not bars or now - updated > timedelta(days=MAX_AGE_DAYS):
        return None
    cutoff = (now - timedelta(days=lookback_days)).date().isoformat()
    out = [
        Candle(
            ts=datetime.fromisoformat(d).replace(tzinfo=timezone.utc),
            open=o, high=h, low=lo, close=c, volume=v,
        )
        for d, o, h, lo, c, v in bars
        if d >= cutoff
    ]
    return out or None
