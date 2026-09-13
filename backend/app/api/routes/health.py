from fastapi import APIRouter

from app.core.config import settings
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
@router.head("/health")
async def health():
    redis_ok = False
    try:
        redis_ok = await get_redis().ping()
    except Exception:  # noqa: BLE001
        redis_ok = False
    return {
        "status": "ok",
        "env": settings.ENV,
        "data_mode": settings.DATA_MODE,
        "ai_provider": settings.AI_PROVIDER,
        "redis": redis_ok,
    }


@router.get("/health/warm")
@router.head("/health/warm")
async def warm():
    """Keep-alive + keep-fresh endpoint for an external cron (cron-job.org,
    UptimeRobot, etc.).

    Hitting this on a schedule does two jobs at once:

      1. Responds quickly, which keeps a free-tier host (Render) awake so it
         never sleeps and cold-starts on a real visitor.
      2. Touches every dashboard snapshot. Each call serves the durable
         snapshot instantly and only kicks a background recompute when that
         snapshot is stale, so it refreshes the data without ever blocking on
         the heavy universe scan (and without hammering provider rate limits).

    Point your existing keep-alive cron at ``/health/warm`` instead of
    ``/health`` (every 5-10 min) to get warm data for free.

    HEAD is also registered: cron-job.org and UptimeRobot both default to
    HEAD, not GET, for their monitors -- a GET-only route 405s that (or, on a
    sleeping instance, surfaces as a wake-proxy 503 instead), so a HEAD-only
    monitor never reliably keeps this warm without it. FastAPI dispatches
    HEAD to this same handler and discards the body per HTTP semantics, so
    the gather() below -- the actual point of this endpoint -- still runs.
    """
    import asyncio

    from app.services import (
        discovery,
        heatmap,
        market as market_svc,
        sector,
        sentiment,
    )
    from app.services import briefing

    m = settings.DEFAULT_MARKET
    results = await asyncio.gather(
        discovery.scan(m),
        sentiment.trending(m),
        sector.rotation(m),
        heatmap.get_heatmap_data(),
        briefing.daily(m),
        market_svc.get_movers(m),
        return_exceptions=True,
    )
    ok = sum(1 for r in results if not isinstance(r, Exception))
    return {"status": "ok", "warmed": ok, "of": len(results)}
