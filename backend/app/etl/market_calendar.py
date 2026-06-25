"""
Market-aware scheduling helpers.

The ETL refresh tasks (quotes, news, sentiment, scores…) only need to run
frequently while the market is actually trading. Hammering yfinance / the free
provider tier every few minutes around the clock — including overnight and all
weekend — burns rate limits for data that isn't changing.

This module exposes:

  * ``market_state(dt)``      — "open" | "closed" | "weekend" for a UTC datetime
  * ``interval_seconds(...)`` — the back-off-adjusted refresh interval (pure, testable)
  * ``MarketAwareSchedule``   — a Celery-beat schedule that uses the above so each
                                task fires on its base cadence during US market hours
                                and backs off when the market is closed.

The pure functions have no Celery dependency so they can be unit-tested directly.
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


# --------------------------------------------------------------------------- #
# Celery-beat schedule. Imported lazily so the pure helpers above stay usable
# without Celery installed (e.g. in lightweight unit tests).
# --------------------------------------------------------------------------- #
try:
    from celery.schedules import schedule, schedstate
    from celery.utils.time import remaining

    class MarketAwareSchedule(schedule):
        """A beat schedule whose interval expands when the US market is closed.

        Behaves like ``celery.schedules.schedule`` but recomputes the effective
        interval on every ``is_due`` check based on the current market state.
        """

        def __init__(
            self,
            base_seconds: int,
            offhours_mult: float = 4.0,
            weekend_mult: float = 12.0,
            **kwargs,
        ) -> None:
            self.base_seconds = max(5, int(base_seconds))
            self.offhours_mult = offhours_mult
            self.weekend_mult = weekend_mult
            super().__init__(run_every=timedelta(seconds=self.base_seconds), **kwargs)

        def _interval(self) -> int:
            return interval_seconds(
                self.base_seconds,
                self.now(),
                self.offhours_mult,
                self.weekend_mult,
            )

        def remaining_estimate(self, last_run_at) -> timedelta:
            return remaining(
                self.maybe_make_aware(last_run_at),
                timedelta(seconds=self._interval()),
                self.maybe_make_aware(self.now()),
            )

        def is_due(self, last_run_at) -> schedstate:
            rem = self.remaining_estimate(last_run_at).total_seconds()
            if rem <= 0:
                # Due now; schedule the next check one full (current) interval out.
                return schedstate(is_due=True, next=self._interval())
            return schedstate(is_due=False, next=rem)

        def __repr__(self) -> str:
            return (
                f"<MarketAwareSchedule base={self.base_seconds}s "
                f"offhours x{self.offhours_mult} weekend x{self.weekend_mult}>"
            )

        def __reduce__(self):
            return (
                self.__class__,
                (self.base_seconds, self.offhours_mult, self.weekend_mult),
            )

except Exception:  # pragma: no cover - Celery not available
    MarketAwareSchedule = None  # type: ignore[assignment]
