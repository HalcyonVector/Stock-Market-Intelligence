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
    yield
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
