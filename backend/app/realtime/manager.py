"""
Connection manager + Redis-backed fan-out.

Why this shape: a single API process can hold thousands of WebSocket clients, but
to scale horizontally each process must receive events produced by ANY worker.
We use Redis Pub/Sub as the bus: ETL/workers PUBLISH events; every API instance
SUBSCRIBES and pushes to its local sockets. This keeps the API stateless and lets
us run N replicas behind a load balancer.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

from app.core.logging import get_logger
from app.core.redis import CH_MARKET_EVENTS, CH_PRICE_TICKS, get_redis

log = get_logger("realtime")


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._sockets.add(ws)
        log.info("ws.connect", clients=len(self._sockets))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets.discard(ws)
        log.info("ws.disconnect", clients=len(self._sockets))

    async def _broadcast(self, message: dict[str, Any]) -> None:
        dead = []
        for ws in list(self._sockets):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    async def start_pubsub(self) -> None:
        """Background task: relay Redis pub/sub messages to local sockets."""
        if self._task:
            return
        self._task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        r = get_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(CH_MARKET_EVENTS, CH_PRICE_TICKS)
        log.info("pubsub.subscribed", channels=[CH_MARKET_EVENTS, CH_PRICE_TICKS])
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue
            try:
                payload = json.loads(msg["data"])
            except (ValueError, TypeError):
                payload = {"raw": msg["data"]}
            await self._broadcast({"channel": msg["channel"], "data": payload})

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()


manager = ConnectionManager()


async def publish_event(channel: str, payload: dict[str, Any]) -> None:
    """Producers call this (from API or workers) to emit a live event."""
    await get_redis().publish(channel, json.dumps(payload, default=str))
