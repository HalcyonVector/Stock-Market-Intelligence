"""
Durable snapshot cache with stale-while-revalidate.

Fixes the cold-cache problem on free-tier hosting. The TTL-based Redis cache
expires after a few idle days (or an eviction / a redeploy), and the old code
then recomputed the full result *inline on the request path* -- a ~115-symbol
universe scan of ~345 live provider calls that takes minutes and trips the
free-provider rate limits. The first visitor after an idle period ate that
whole cost and usually gave up.

This layer keeps a **durable** (no-TTL) snapshot of the last successful result
alongside a freshness timestamp:

  * A request always gets the last snapshot **instantly**.
  * If the snapshot is older than ``max_age`` it is served anyway and a refresh
    is kicked off **in the background** (never awaited). The frontend's 30s
    poll picks up the fresh data on the next tick.
  * If no snapshot exists yet, the caller's ``empty`` default is returned
    immediately and a warm is kicked off in the background.

The request path therefore never blocks on a universe scan. The scan only ever
runs in the background (startup warm, the keep-alive cron, or Celery beat).
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Awaitable, Callable

from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("snapshot")

# Durable snapshots live under their own prefix and are written WITHOUT a TTL,
# so they survive idle periods that expire the regular short-lived caches.
_PREFIX = "snap:"

# Keys currently refreshing, so a burst of requests kicks off exactly one
# background recompute instead of dozens.
_inflight: set[str] = set()


async def read(key: str) -> tuple[Any, float] | None:
    """Return ``(value, ts)`` for a snapshot, or ``None`` if absent/unreadable."""
    try:
        raw = await get_redis().get(_PREFIX + key)
    except Exception as e:  # noqa: BLE001 -- Redis down must not break the request
        log.warning("snapshot.read_failed", key=key, error=str(e))
        return None
    if not raw:
        return None
    try:
        obj = json.loads(raw)
        return obj["v"], float(obj.get("ts", 0.0))
    except Exception as e:  # noqa: BLE001
        log.warning("snapshot.read_parse_failed", key=key, error=str(e))
        return None


async def write(key: str, value: Any) -> None:
    """Persist ``value`` as the durable last-good snapshot for ``key`` (no TTL)."""
    try:
        payload = json.dumps({"v": value, "ts": time.time()}, default=str)
        await get_redis().set(_PREFIX + key, payload)
    except Exception as e:  # noqa: BLE001 -- a silent failure here means the
        # computed result (which may have taken minutes to gather) is thrown
        # away with zero trace: the caller sees a normal return, logs
        # "warm.ok", and every future read keeps serving the last snapshot
        # that DID get written (however old/empty that was) forever.
        log.error("snapshot.write_failed", key=key, error=str(e))


async def _refresh(key: str, computor: Callable[[], Awaitable[Any]]) -> Any:
    try:
        result = await computor()
        await write(key, result)
        return result
    except Exception as e:  # noqa: BLE001
        log.warning("snapshot.refresh_failed", key=key, error=str(e))
        return None
    finally:
        _inflight.discard(key)


def kick(key: str, computor: Callable[[], Awaitable[Any]]) -> None:
    """Fire a background refresh for ``key`` if one isn't already running.

    Safe to call from a request handler: it schedules the compute and returns
    immediately. If there is no running event loop (e.g. called from a sync
    Celery task), the caller should await ``_refresh`` directly instead.
    """
    if key in _inflight:
        return
    _inflight.add(key)
    try:
        asyncio.create_task(_refresh(key, computor))
    except RuntimeError:
        # No running loop -- undo the reservation; caller handles compute.
        _inflight.discard(key)


async def serve(
    key: str,
    computor: Callable[[], Awaitable[Any]],
    *,
    max_age: float,
    empty: Any,
) -> Any:
    """Serve the durable snapshot instantly, refreshing in the background.

    Never blocks on a full recompute. See the module docstring for the policy.
    """
    snap = await read(key)
    if snap is not None:
        value, ts = snap
        if (time.time() - ts) > max_age:
            kick(key, computor)  # stale -- refresh without blocking
        return value
    # No snapshot at all -- warm in the background, return empty for now. The
    # startup warm / keep-alive cron normally populates this before real users.
    kick(key, computor)
    return empty
