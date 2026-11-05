"""
Price alerts — persist in Redis, check against live quotes.

Alerts are checked two ways:
- in the background by the API's in-process refresh loop (``check_all_users``),
  which batches every user's symbols into a single quotes() call, and
- on demand via ``GET /alerts/check``.

The browser polls its own alert list and raises a notification when an alert
flips to ``triggered``, so no email/SMS service (and no paid tier) is needed.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.config import settings
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("alerts")

ALERTS_KEY = "price_alerts:{user_id}"
# Set of user ids that currently own at least one alert, so the background
# checker can find them without a KEYS/SCAN sweep.
USERS_KEY = "price_alerts:users"
TTL = 86400 * 30
MAX_ALERTS_PER_USER = 50

CONDITIONS = ("above", "below", "change_pct_above", "change_pct_below")


async def _load(r, user_id: str) -> list[dict]:
    raw = await r.get(ALERTS_KEY.format(user_id=user_id))
    return json.loads(raw) if raw else []


async def _save(r, user_id: str, alerts: list[dict]) -> None:
    key = ALERTS_KEY.format(user_id=user_id)
    if alerts:
        await r.set(key, json.dumps(alerts), ex=TTL)
        await r.sadd(USERS_KEY, user_id)
    else:
        await r.delete(key)
        await r.srem(USERS_KEY, user_id)


async def create_alert(
    user_id: str,
    symbol: str,
    condition: str,  # "above" | "below" | "change_pct_above" | "change_pct_below"
    threshold: float,
    note: str = "",
) -> dict:
    if condition not in CONDITIONS:
        raise ValueError(f"condition must be one of {CONDITIONS}")
    r = get_redis()

    alert = {
        "id": str(uuid.uuid4())[:8],
        "symbol": symbol.upper(),
        "condition": condition,
        "threshold": threshold,
        "note": note,
        "triggered": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "triggered_at": None,
    }

    try:
        alerts = await _load(r, user_id)
    except Exception:
        alerts = []
    if len(alerts) >= MAX_ALERTS_PER_USER:
        raise ValueError(f"At most {MAX_ALERTS_PER_USER} alerts per browser")

    alerts.append(alert)
    await _save(r, user_id, alerts)

    from app.services.symbols import register_extra
    await register_extra(alert["symbol"])
    return alert


async def list_alerts(user_id: str) -> list[dict]:
    try:
        return await _load(get_redis(), user_id)
    except Exception:
        return []


async def delete_alert(user_id: str, alert_id: str) -> None:
    r = get_redis()
    try:
        alerts = [a for a in await _load(r, user_id) if a["id"] != alert_id]
        await _save(r, user_id, alerts)
    except Exception:
        pass


def _hit(alert: dict, price: float, change_pct: float) -> bool:
    cond, th = alert["condition"], alert["threshold"]
    return (
        (cond == "above" and price >= th)
        or (cond == "below" and price <= th)
        or (cond == "change_pct_above" and change_pct >= th)
        or (cond == "change_pct_below" and change_pct <= th)
    )


def _apply(alerts: list[dict], quotes: dict) -> list[dict]:
    """Mark alerts whose condition holds; return the newly triggered ones."""
    triggered = []
    now = datetime.now(timezone.utc).isoformat()
    for alert in alerts:
        if alert["triggered"]:
            continue
        q = quotes.get(alert["symbol"])
        if q is None or q.price is None:
            continue
        if settings.DATA_MODE == "live" and getattr(q, "source", "live") == "mock":
            continue  # never fire an alert on sample data
        change = q.change_pct or 0
        if _hit(alert, q.price, change):
            alert["triggered"] = True
            alert["triggered_at"] = now
            alert["trigger_price"] = q.price
            alert["trigger_change_pct"] = change
            triggered.append(alert)
    return triggered


async def _quotes_for(symbols: set[str]) -> dict:
    if not symbols:
        return {}
    quotes = await providers.market.quotes(sorted(symbols))
    return {q.symbol.upper(): q for q in quotes}


async def check_alerts(user_id: str) -> list[dict]:
    """Check one user's active alerts against current prices. Returns newly triggered alerts."""
    r = get_redis()
    try:
        alerts = await _load(r, user_id)
    except Exception:
        return []
    pending = {a["symbol"] for a in alerts if not a["triggered"]}
    try:
        quotes = await _quotes_for(pending)
    except Exception:
        return []
    triggered = _apply(alerts, quotes)
    if triggered:
        await _save(r, user_id, alerts)
        await _push(user_id, triggered)
    return triggered


async def _push(user_id: str, triggered: list[dict]) -> None:
    try:
        from app.services.push import notify_alerts

        await notify_alerts(user_id, triggered)
    except Exception as e:  # noqa: BLE001 -- a push failure must not lose the alert
        log.warning("alerts.push_failed", error=str(e)[:160])


async def check_all_users() -> int:
    """Background pass over every user's alerts with one batched quote fetch.

    Redis cost per pass: 1 SMEMBERS + 1 GET per alert owner (+1 SET only for
    users whose alerts fired). Returns how many alerts fired.
    """
    r = get_redis()
    user_ids = list(await r.smembers(USERS_KEY))
    if not user_ids:
        return 0

    per_user: dict[str, list[dict]] = {}
    symbols: set[str] = set()
    for uid in user_ids:
        uid = uid.decode() if isinstance(uid, bytes) else uid
        alerts = await _load(r, uid)
        if not alerts:
            await r.srem(USERS_KEY, uid)  # key expired; drop from the index
            continue
        per_user[uid] = alerts
        symbols |= {a["symbol"] for a in alerts if not a["triggered"]}

    quotes = await _quotes_for(symbols)
    fired = 0
    for uid, alerts in per_user.items():
        triggered = _apply(alerts, quotes)
        if triggered:
            fired += len(triggered)
            await _save(r, uid, alerts)
            await _push(uid, triggered)
    log.info("alerts.background_check", users=len(per_user), symbols=len(symbols), fired=fired)
    return fired
