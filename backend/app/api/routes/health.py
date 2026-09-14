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


_STAGGER_SECONDS = 3


async def _staggered_refresh() -> None:
    """Detached background pass over all six dashboard snapshots, spaced
    ``_STAGGER_SECONDS`` apart.

    Each of the six calls is cheap on its own (an instant snapshot read that
    only *kicks* a background recompute when stale) -- but if every snapshot
    is stale at once -- exactly the case right after this service has been
    asleep for a while, which is precisely when a keep-alive ping arrives --
    reading them all back-to-back with no gap fires all six heavy background
    recomputes (a full universe scan, an LLM call for the briefing, etc.) in
    the same instant, right as the container is still settling from a cold
    boot. That's suspected to have OOM'd the free-tier instance before: a
    fast 200 would go out, then the pile-up crashed the process moments
    later, so the *next* scheduled ping hit another cold boot and repeated
    the cycle -- the same class of bug as the AI Research Radar 6-job-chain
    OOM. Spacing out when each kick fires keeps at most one or two heavy
    recomputes running at a time instead of all six.

    Runs detached (fire-and-forget from the route handler) specifically so
    none of this ever adds latency to the HTTP response -- an earlier version
    awaited this stagger inline in the request, which pushed /health/warm
    past cron-job.org's configured timeout and turned every ping into a
    guaranteed failure. The whole point of this endpoint is to respond fast;
    the data-freshness work must never be on that critical path.
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
    for i, call in enumerate(calls):
        if i:
            await asyncio.sleep(_STAGGER_SECONDS)
        try:
            await call
        except Exception:
            pass


@router.get("/health/warm")
@router.head("/health/warm")
async def warm():
    """Keep-alive + keep-fresh endpoint for an external cron (cron-job.org,
    UptimeRobot, etc.).

    Hitting this responds immediately (matching /health's speed) and kicks
    off ``_staggered_refresh()`` as a detached background task -- it does
    NOT wait for it. That keeps this endpoint's own job (waking/keeping the
    free-tier host warm) fast and reliable regardless of how long the
    dashboard-refresh pass underneath takes.

    HEAD is also registered: cron-job.org and UptimeRobot both default to
    HEAD, not GET, for their monitors -- a GET-only route 405s that (or, on a
    sleeping instance, surfaces as a wake-proxy 503 instead), so a HEAD-only
    monitor never reliably keeps this warm without it.
    """
    import asyncio

    asyncio.create_task(_staggered_refresh())
    return {"status": "ok", "warming": True}
