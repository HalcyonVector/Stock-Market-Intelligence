"""
FastAPI application entrypoint.

Lifespan starts the Redis pub/sub relay so the WebSocket layer receives events
published by Celery workers. Read endpoints work without a database (mock mode),
which keeps the bar to "running locally" extremely low for a solo engineer.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    alerts, auth, backtest, discovery, health, insights, invest, market,
    portfolio, realtime, screener, sectors, sentiment, stocks, watchlists,
)
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.realtime.manager import manager

configure_logging()
log = get_logger("app")


async def _warm_caches() -> None:
    """Pre-warm dashboard caches on FastAPI startup so cards load instantly.

    Runs every heavy service once, in parallel.  Failures are logged and
    swallowed — the worst outcome is a single card loading on first browser
    request instead of being pre-cached.
    """
    import asyncio
    from app.services import market as market_svc, sector, sentiment, discovery, insider
    from app.services.briefing import compute_daily
    from app.services.heatmap import compute_heatmap

    tasks = {
        "movers": market_svc.compute_movers(settings.DEFAULT_MARKET),
        "sectors": sector.compute_rotation(settings.DEFAULT_MARKET),
        "sentiment": sentiment.compute_trending(settings.DEFAULT_MARKET),
        "discovery": discovery.compute_scan(settings.DEFAULT_MARKET),
        "briefing": compute_daily(settings.DEFAULT_MARKET),
        "heatmap": compute_heatmap(),
        "insider": insider.compute_insider_activity(settings.DEFAULT_MARKET),
    }
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    for name, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            log.warning("warm.failed", task=name, error=str(result))
        else:
            log.info("warm.ok", task=name)

    # After movers are cached, seed the LiveFeed with initial events.
    # Use the already-cached movers data to avoid double-fetching quotes.
    try:
        movers_result = None
        for name, result in zip(tasks.keys(), results):
            if name == "movers" and not isinstance(result, Exception):
                movers_result = result
        await _seed_livefeed_from_movers(movers_result)
    except Exception as e:
        log.warning("warm.livefeed.failed", error=str(e))


async def _seed_livefeed_from_movers(movers: dict | None) -> None:
    """Publish initial LiveFeed events from already-cached movers data.

    Publishes price ticks for all movers (so the feed has content even on quiet
    days) plus unusual-activity events for big moves / volume spikes.
    """
    if not movers:
        return
    from datetime import datetime, timezone
    from app.core.redis import CH_MARKET_EVENTS, CH_PRICE_TICKS
    from app.realtime.manager import publish_event

    seen: set[str] = set()
    events = 0
    for bucket in ("gainers", "losers", "most_active"):
        for q in movers.get(bucket, []):
            sym = q.get("symbol", "")
            if sym in seen:
                continue
            seen.add(sym)
            change = q.get("change_pct", 0)

            # Price tick — always publish so the feed shows something
            await publish_event(CH_PRICE_TICKS, {
                "symbol": sym, "price": q.get("price"),
                "change_pct": change,
                "ts": datetime.now(timezone.utc).isoformat(),
            })

            # Unusual activity — only for big moves / volume spikes
            vol_ratio = q.get("volume", 0) / q.get("avg_volume", 1) if q.get("avg_volume") else 1.0
            if abs(change) >= 5 or vol_ratio >= 3:
                events += 1
                await publish_event(CH_MARKET_EVENTS, {
                    "type": "unusual_activity",
                    "symbol": sym,
                    "change_pct": change,
                    "volume_ratio": round(vol_ratio, 2),
                    "severity": "high" if abs(change) >= 8 else "medium",
                    "ts": datetime.now(timezone.utc).isoformat(),
                })
    log.info("livefeed.seed", ticks=len(seen), events=events)


async def _publish_market_events() -> None:
    """Fetch quotes and publish unusual-activity events to the Redis bus.

    Replicates the detect-and-publish logic from the Celery refresh_market task
    so the LiveFeed WebSocket card works without Celery running.
    """
    from datetime import datetime, timezone
    from app.adapters.registry import providers
    from app.core.redis import CH_MARKET_EVENTS, CH_PRICE_TICKS
    from app.realtime.manager import publish_event

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
    log.info("livefeed.publish", symbols=len(syms), events=events)


async def _periodic_market_refresh() -> None:
    """Background loop that periodically refreshes market data and publishes
    LiveFeed events, replacing Celery beat for the refresh_market task.

    Runs every REFRESH_MARKET seconds (default 15 min). Skips a cycle if the
    previous one is still running. Failures are swallowed so the loop never dies.
    """
    import asyncio
    interval = settings.REFRESH_MARKET
    # Wait for the initial warm to finish before starting the loop
    await asyncio.sleep(interval)
    while True:
        try:
            await _publish_market_events()
            # Also re-warm the movers cache since we already fetched quotes
            from app.services import market as market_svc
            await market_svc.compute_movers(settings.DEFAULT_MARKET)
        except Exception as e:
            log.warning("periodic.refresh.failed", error=str(e))
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await manager.start_pubsub()
    if settings.AUTO_CREATE_TABLES:
        # Best-effort: create tables for dev runs. No-op/skip if DB unreachable
        # (mock-mode without Postgres still boots and serves read endpoints).
        try:
            from app.db.session import engine
            from app.models.entities import Base
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            log.info("tables.ready")
        except Exception as e:  # noqa: BLE001
            log.warning("tables.skip", error=str(e))
    log.info("startup", env=settings.ENV, data_mode=settings.DATA_MODE)

    # Pre-warm all dashboard caches so the first browser visit sees data
    # immediately, even without Celery worker/beat running.
    import asyncio
    asyncio.create_task(_warm_caches())

    # Periodic market refresh loop — keeps the LiveFeed WebSocket card alive
    # by publishing price ticks and unusual-activity events to Redis pub/sub,
    # independent of Celery.
    refresh_task = asyncio.create_task(_periodic_market_refresh())

    yield
    refresh_task.cancel()
    await manager.stop()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI-powered market intelligence platform (educational use only).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = settings.API_V1_PREFIX
for r in (market, discovery, stocks, sentiment, sectors, insights, portfolio, auth, watchlists, screener, backtest, alerts, invest):
    app.include_router(r.router, prefix=api)
app.include_router(realtime.router, prefix=api)
app.include_router(health.router)


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "docs": "/docs", "health": "/health"}
