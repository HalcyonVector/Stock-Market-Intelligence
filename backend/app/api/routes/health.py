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
    the staggered pass below -- the actual point of this endpoint -- still
    runs.

    STAGGERED, not gathered: each of the six calls below is cheap on its own
    (an instant snapshot read that only *kicks* a background recompute when
    stale), but if every snapshot is stale at once -- exactly the case right
    after this service has been asleep for a while, which is precisely when
    a keep-alive ping arrives -- gathering them concurrently used to fire all
    six heavy background recomputes (a full universe scan, an LLM call for
    the briefing, etc.) in the same instant, right as the container was
    still settling from a cold boot. That OOM'd the free-tier instance: the
    request itself returned a fast 200, then the pile-up crashed the process
    moments later, so the *next* scheduled ping hit another cold boot and
    repeated the cycle -- the same class of bug as the AI Research Radar
    6-job-chain OOM. A short delay between each kick keeps at most one or
    two heavy recomputes running at a time instead of all six.
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
    calls = [
        discovery.scan(m),
        sentiment.trending(m),
        sector.rotation(m),
        heatmap.get_heatmap_data(),
        briefing.daily(m),
        market_svc.get_movers(m),
    ]
    stagger_seconds = 3
    results = []
    for i, call in enumerate(calls):
        if i:
            await asyncio.sleep(stagger_seconds)
        try:
            results.append(await call)
        except Exception as e:  # noqa: BLE001
            results.append(e)
    ok = sum(1 for r in results if not isinstance(r, Exception))
    return {"status": "ok", "warmed": ok, "of": len(results)}
