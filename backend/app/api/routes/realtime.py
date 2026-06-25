"""WebSocket + Server-Sent Events endpoints for the live feed."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from sse_starlette.sse import EventSourceResponse

from app.core.redis import CH_MARKET_EVENTS, CH_PRICE_TICKS, get_redis
from app.realtime.manager import manager

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Keep the socket open; client may send pings/subscriptions.
            await ws.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(ws)


@router.get("/sse/live")
async def sse_live(request: Request):
    """SSE fallback for environments where WebSockets are blocked."""
    async def event_gen():
        pubsub = get_redis().pubsub()
        await pubsub.subscribe(CH_MARKET_EVENTS, CH_PRICE_TICKS)
        try:
            async for msg in pubsub.listen():
                if await request.is_disconnected():
                    break
                if msg.get("type") != "message":
                    continue
                yield {"event": msg["channel"], "data": msg["data"]}
        finally:
            await pubsub.unsubscribe()

    return EventSourceResponse(event_gen())
