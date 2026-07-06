"""
Celery tasks. Each is sync (Celery) but drives async services via asyncio.run.

Detect-and-publish pattern: after refreshing data, tasks look for "unusual"
conditions (big moves, volume spikes) and PUBLISH MarketEvents to the Redis bus,
which the WebSocket layer streams to clients in real time.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from celery.signals import worker_ready

from app.core.logging import get_logger
from app.core.redis import CH_MARKET_EVENTS, CH_PRICE_TICKS
from app.etl.celery_app import celery_app
from app.realtime.manager import publish_event

log = get_logger("etl")


def _run(coro):
    async def _wrapper():
        try:
            return await coro
        finally:
            from app.core.redis import close_redis
            await close_redis()
    return asyncio.run(_wrapper())


@celery_app.task(name="app.etl.tasks.refresh_market")
def refresh_market() -> dict:
    return _run(_refresh_market())


async def _refresh_market() -> dict:
    from app.adapters.registry import providers
    from app.core.config import settings

    syms = await providers.market.universe(settings.DEFAULT_MARKET)
    quotes = await providers.market.quotes(syms)
    events = 0
    for q in quotes:
        await publish_event(CH_PRICE_TICKS, {
            "symbol": q.symbol, "price": q.price, "change_pct": q.change_pct,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        vol_ratio = q.volume / q.avg_volume if q.avg_volume else 1.0
        if abs(q.change_pct) >= 5 or vol_ratio >= 3:
            events += 1
            await publish_event(CH_MARKET_EVENTS, {
                "type": "unusual_activity",
                "symbol": q.symbol,
                "change_pct": q.change_pct,
                "volume_ratio": round(vol_ratio, 2),
                "severity": "high" if abs(q.change_pct) >= 8 else "medium",
                "ts": datetime.now(timezone.utc).isoformat(),
            })
    log.info("etl.refresh_market", symbols=len(syms), events=events)
    return {"symbols": len(syms), "events": events}


@celery_app.task(name="app.etl.tasks.refresh_news")
def refresh_news() -> dict:
    return _run(_refresh_news())


async def _refresh_news() -> dict:
    from app.adapters.registry import providers
    items = await providers.news.latest(limit=30)
    log.info("etl.refresh_news", count=len(items))
    return {"count": len(items)}


@celery_app.task(name="app.etl.tasks.refresh_sentiment")
def refresh_sentiment() -> dict:
    return _run(_refresh_sentiment())


async def _refresh_sentiment() -> dict:
    from app.services.sentiment import compute_trending
    rows = await compute_trending()
    log.info("etl.refresh_sentiment", count=len(rows))
    return {"count": len(rows)}


@celery_app.task(name="app.etl.tasks.refresh_sectors")
def refresh_sectors() -> dict:
    return _run(_refresh_sectors())


async def _refresh_sectors() -> dict:
    from app.services.sector import compute_rotation
    rows = await compute_rotation()
    log.info("etl.refresh_sectors", count=len(rows))
    return {"count": len(rows)}


@celery_app.task(name="app.etl.tasks.refresh_heatmap")
def refresh_heatmap() -> dict:
    return _run(_refresh_heatmap())


async def _refresh_heatmap() -> dict:
    from app.services.heatmap import compute_heatmap
    result = await compute_heatmap()
    log.info("etl.refresh_heatmap", stocks=result.get("total_stocks", 0))
    return {"stocks": result.get("total_stocks", 0)}


@celery_app.task(name="app.etl.tasks.refresh_briefing")
def refresh_briefing() -> dict:
    return _run(_refresh_briefing())


async def _refresh_briefing() -> dict:
    from app.core.config import settings
    from app.services.briefing import compute_daily
    await compute_daily(settings.DEFAULT_MARKET)
    log.info("etl.refresh_briefing", market=settings.DEFAULT_MARKET)
    return {"ok": True}


@celery_app.task(name="app.etl.tasks.recompute_scores")
def recompute_scores() -> dict:
    return _run(_recompute_scores())


async def _recompute_scores() -> dict:
    from app.services.discovery import compute_scan
    rows = await compute_scan()
    if rows:
        await publish_event(CH_MARKET_EVENTS, {
            "type": "scores_updated",
            "top": [r["symbol"] for r in rows[:5]],
            "ts": datetime.now(timezone.utc).isoformat(),
        })
    log.info("etl.recompute_scores", count=len(rows))
    return {"count": len(rows)}


@worker_ready.connect
def _warm_caches_on_startup(sender=None, **kwargs) -> None:
    """
    Pre-warm every cached card the moment the worker boots.

    Celery beat's first run only fires after one full interval, which leaves a
    cold window (up to 30 min) where the first visitor triggers a live scan.
    Enqueuing the refresh tasks on worker_ready closes that window.
    """
    for task in (
        refresh_market, refresh_news, refresh_sentiment,
        refresh_sectors, refresh_heatmap, refresh_briefing, recompute_scores,
    ):
        task.delay()
    log.info("etl.warm_on_startup", tasks=7)
