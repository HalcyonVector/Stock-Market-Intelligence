"""
Tests for the market-aware ETL back-off (app.etl.market_calendar).

The pure helpers (market_state / interval_seconds) are exercised with fixed UTC
datetimes so the result is independent of when the suite runs. Mid-day UTC
instants are used so the US/Eastern offset never flips the weekday.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.etl.market_calendar import interval_seconds, market_state

# 2026-06-24 is a Wednesday, 2026-06-27 is a Saturday.
WEEKDAY_OPEN = datetime(2026, 6, 24, 14, 0, tzinfo=timezone.utc)    # 10:00 ET → open
WEEKDAY_CLOSED = datetime(2026, 6, 24, 21, 30, tzinfo=timezone.utc)  # 17:30 ET → closed
WEEKEND = datetime(2026, 6, 27, 14, 0, tzinfo=timezone.utc)          # Saturday


def test_market_state_classification():
    assert market_state(WEEKDAY_OPEN) == "open"
    assert market_state(WEEKDAY_CLOSED) == "closed"
    assert market_state(WEEKEND) == "weekend"


def test_naive_datetime_treated_as_utc():
    naive = WEEKDAY_OPEN.replace(tzinfo=None)
    assert market_state(naive) == "open"


def test_interval_uses_base_during_market_hours():
    assert interval_seconds(300, WEEKDAY_OPEN, offhours_mult=4, weekend_mult=12) == 300


def test_interval_backs_off_offhours_and_weekend():
    assert interval_seconds(300, WEEKDAY_CLOSED, offhours_mult=4, weekend_mult=12) == 1200
    assert interval_seconds(300, WEEKEND, offhours_mult=4, weekend_mult=12) == 3600


def test_interval_floor_is_five_seconds():
    # Even with a tiny base and sub-unit multipliers the interval never drops
    # below the 5s floor.
    assert interval_seconds(1, WEEKDAY_OPEN) >= 5
    assert interval_seconds(1, WEEKEND, weekend_mult=0.001) >= 5


def test_weekend_backoff_exceeds_offhours():
    base = 600
    off = interval_seconds(base, WEEKDAY_CLOSED, offhours_mult=4, weekend_mult=12)
    wknd = interval_seconds(base, WEEKEND, offhours_mult=4, weekend_mult=12)
    assert wknd > off > base
