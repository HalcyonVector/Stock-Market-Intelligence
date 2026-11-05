"""
Web Push notifications for price alerts: they reach the phone/desktop even
when the site is closed.

Uses the browser-standard Web Push protocol with VAPID keys, so no third-party
service or account is involved: the browser vendor's push service (FCM,
Mozilla, Apple) delivers for free. Generate the keys once with
``python -m scripts.gen_vapid`` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on
Render. Without them the feature simply reports itself as unavailable.

Subscriptions live in Redis (``push:{user_id}`` hash, at most MAX_DEVICES per
browser identity) and are only read when an alert fires, so the Upstash cost
is a handful of commands per triggered alert.
"""
from __future__ import annotations

import asyncio
import hashlib
import json

from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("services.push")

MAX_DEVICES = 5
SUB_TTL = 400 * 24 * 3600  # refreshed whenever the browser re-subscribes


def enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def _key(user_id: str) -> str:
    return f"push:{user_id}"


def _field(endpoint: str) -> str:
    return hashlib.sha1(endpoint.encode()).hexdigest()[:16]


def _valid(sub: dict) -> bool:
    keys = sub.get("keys") or {}
    endpoint = sub.get("endpoint") or ""
    return (endpoint.startswith("https://") and len(endpoint) < 1000
            and isinstance(keys.get("p256dh"), str) and isinstance(keys.get("auth"), str))


async def subscribe(user_id: str, sub: dict) -> None:
    if not _valid(sub):
        raise ValueError("Invalid push subscription")
    r = get_redis()
    key = _key(user_id)
    field = _field(sub["endpoint"])
    existing = await r.hkeys(key)
    existing = [k.decode() if isinstance(k, bytes) else k for k in existing]
    if field not in existing and len(existing) >= MAX_DEVICES:
        await r.hdel(key, existing[0])  # oldest-ish device makes room
    clean = {"endpoint": sub["endpoint"], "keys": {"p256dh": sub["keys"]["p256dh"], "auth": sub["keys"]["auth"]}}
    await r.hset(key, field, json.dumps(clean))
    await r.expire(key, SUB_TTL)


async def unsubscribe(user_id: str, endpoint: str) -> None:
    await get_redis().hdel(_key(user_id), _field(endpoint))


async def device_count(user_id: str) -> int:
    try:
        return int(await get_redis().hlen(_key(user_id)))
    except Exception:  # noqa: BLE001
        return 0


def _send_one(sub: dict, payload: str) -> int | None:
    """Blocking send (pywebpush uses requests). Returns an HTTP status to act
    on, or None on success."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=sub, data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=6 * 3600, timeout=10,
        )
        return None
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        log.warning("push.send_failed", status=status, error=str(e)[:160])
        return status or 0
    except Exception as e:  # noqa: BLE001
        log.warning("push.send_error", error=str(e)[:160])
        return 0


async def notify(user_id: str, title: str, body: str, url: str = "/alerts", tag: str | None = None) -> int:
    """Send a notification to every device of this browser identity.
    Returns how many devices accepted it. Never raises."""
    if not enabled():
        return 0
    r = get_redis()
    try:
        subs = await r.hgetall(_key(user_id))
    except Exception:  # noqa: BLE001
        return 0
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    sent = 0
    for field, raw in subs.items():
        sub = json.loads(raw)
        status = await asyncio.to_thread(_send_one, sub, payload)
        if status is None:
            sent += 1
        elif status in (404, 410):  # subscription expired or revoked
            try:
                await r.hdel(_key(user_id), field)
            except Exception:  # noqa: BLE001
                pass
    return sent


def describe_alert(alert: dict) -> tuple[str, str]:
    sym = alert["symbol"]
    th = alert["threshold"]
    cond = alert["condition"]
    price = alert.get("trigger_price")
    chg = alert.get("trigger_change_pct")
    what = {
        "above": f"rose above {th:g}",
        "below": f"fell below {th:g}",
        "change_pct_above": f"is up more than {th:g}% today",
        "change_pct_below": f"is down more than {abs(th):g}% today",
    }.get(cond, "hit your alert")
    title = f"{sym} {what}"
    body = f"Now {price:,.2f}" + (f" ({chg:+.2f}%)" if chg is not None else "") if price is not None else ""
    if alert.get("note"):
        body = f"{body} · {alert['note']}" if body else alert["note"]
    return title, body


async def notify_alerts(user_id: str, triggered: list[dict]) -> None:
    for alert in triggered[:5]:
        title, body = describe_alert(alert)
        await notify(user_id, title, body, url=f"/stock/{alert['symbol']}", tag=f"alert-{alert['id']}")
