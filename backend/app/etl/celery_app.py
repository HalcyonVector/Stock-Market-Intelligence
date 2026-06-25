"""
Celery application + beat schedule.

The ETL layer runs the periodic scans that keep the platform feeling "alive":
quotes refresh every ~30s, news every 5m, sentiment every ~10m, discovery scores
every 15m (see docs/STREAMING.md). Each task writes to Postgres + Redis cache and
publishes live events to the Redis bus consumed by the WebSocket layer.
"""
from __future__ import annotations

from celery import Celery
from celery.schedules import schedule

from app.core.config import settings

celery_app = Celery(
    "sdi",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.etl.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Refresh at 80% of each cache's TTL so the entry is always rewritten *before*
# it expires, eliminating cold-miss windows. (Each cache's TTL is driven by the
# same REFRESH_* setting, so 0.8x guarantees an overwrite within the live window.)
_WARM_RATIO = 0.8


def _warm(ttl_seconds: int) -> schedule:
    return schedule(max(5, int(ttl_seconds * _WARM_RATIO)))


celery_app.conf.beat_schedule = {
    "refresh-market": {
        "task": "app.etl.tasks.refresh_market",
        "schedule": _warm(settings.REFRESH_MARKET),
    },
    "refresh-news": {
        "task": "app.etl.tasks.refresh_news",
        "schedule": _warm(settings.REFRESH_NEWS),
    },
    "refresh-sentiment": {
        "task": "app.etl.tasks.refresh_sentiment",
        "schedule": _warm(settings.REFRESH_SENTIMENT),
    },
    "refresh-sectors": {
        "task": "app.etl.tasks.refresh_sectors",
        "schedule": _warm(settings.REFRESH_SCORES),  # same cadence as scores
    },
    "recompute-scores": {
        "task": "app.etl.tasks.recompute_scores",
        "schedule": _warm(settings.REFRESH_SCORES),
    },
    "refresh-heatmap": {
        "task": "app.etl.tasks.refresh_heatmap",
        "schedule": _warm(settings.REFRESH_SCORES),  # same cadence as scores
    },
    "refresh-briefing": {
        "task": "app.etl.tasks.refresh_briefing",
        "schedule": _warm(settings.REFRESH_NEWS),  # keep the AI briefing warm
    },
}
