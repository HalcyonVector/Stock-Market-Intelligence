"""
Market-aware scheduling helpers.

The ETL refresh tasks (quotes, news, sentiment, scores…) only need to run
frequently while the market is actually trading. Hammering yfinance / the free
provider tier every few minutes around the clock — including overnight and all
weekend — burns rate limits for data that isn't changing.

This module exposes:

  * ``market_state(dt)``      — "open" | "closed" | "weekend" for a UTC datetime
  * ``interval_seconds(...)`` — the back-off-adjusted refresh interval (pure, testable)

main.py's refresh loop uses ``interval_seconds`` to run on its base cadence
during US market hours and back off when the market is closed.
US regular session is 09:30–16:00 America/New_York, Mon–Fri. Exchange holidays
are intentionally not modelled here — on a holiday the schedule simply behaves as
a normal weekday ("closed" outside 09:30–16:00), which is harmless: the circuit
breaker + cache still protect the providers.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    _ET = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - zoneinfo always present on 3.9+
    _ET = None

_MARKET_OPEN = time(9, 30)
_MARKET_CLOSE = time(16, 0)


def market_state(dt: datetime | None = None) -> str:
    """Classify a moment as 'open', 'closed' (weekday, outside hours) or 'weekend'.

    ``dt`` is treated as UTC if naive. Falls back to a fixed UTC-4 offset only if
    the tz database is unavailable.
    """
    now = dt or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if _ET is not None:
        et = now.astimezone(_ET)
    else:  # pragma: no cover - extremely rare (no tzdata)
        et = now.astimezone(timezone(timedelta(hours=-4)))

    if et.weekday() >= 5:  # Sat / Sun
        return "weekend"
    if _MARKET_OPEN <= et.time() < _MARKET_CLOSE:
        return "open"
    return "closed"


def interval_seconds(
    base_seconds: int,
    dt: datetime | None = None,
    offhours_mult: float = 4.0,
    weekend_mult: float = 12.0,
) -> int:
    """Return the refresh interval for ``dt``, scaled up when the market is closed.

    During the regular session the base cadence is used unchanged. Outside hours
    it is multiplied by ``offhours_mult``; on weekends by the larger
    ``weekend_mult``. Never returns less than 5 seconds.
    """
    base = max(5, int(base_seconds))
    state = market_state(dt)
    if state == "open":
        return base
    if state == "weekend":
        return max(5, int(base * weekend_mult))
    return max(5, int(base * offhours_mult))
