"""
Price alerts — persist in Redis, check against live quotes.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app.core.redis import get_redis
from app.adapters.registry import providers

ALERTS_KEY = "price_alerts:{user_id}"


async def create_alert(
    user_id: str,
    symbol: str,
    condition: str,  # "above" | "below" | "change_pct_above" | "change_pct_below"
    threshold: float,
    note: str = "",
) -> dict:
    r = get_redis()
    key = ALERTS_KEY.format(user_id=user_id)

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
        raw = await r.get(key)
        alerts = json.loads(raw) if raw else []
    except Exception:
        alerts = []

    alerts.append(alert)
    await r.set(key, json.dumps(alerts), ex=86400 * 30)
    return alert


async def list_alerts(user_id: str) -> list[dict]:
    r = get_redis()
    key = ALERTS_KEY.format(user_id=user_id)
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else []
    except Exception:
        return []


async def delete_alert(user_id: str, alert_id: str) -> None:
    r = get_redis()
    key = ALERTS_KEY.format(user_id=user_id)
    try:
        raw = await r.get(key)
        alerts = json.loads(raw) if raw else []
        alerts = [a for a in alerts if a["id"] != alert_id]
        await r.set(key, json.dumps(alerts), ex=86400 * 30)
    except Exception:
        pass


async def check_alerts(user_id: str) -> list[dict]:
    """Check all active alerts against current prices. Returns newly triggered alerts."""
    r = get_redis()
    key = ALERTS_KEY.format(user_id=user_id)

    try:
        raw = await r.get(key)
        alerts = json.loads(raw) if raw else []
    except Exception:
        return []

    triggered = []
    modified = False

    for alert in alerts:
        if alert["triggered"]:
            continue

        try:
            q = await providers.market.quote(alert["symbol"])
            hit = False

            if alert["condition"] == "above" and q.price >= alert["threshold"]:
                hit = True
            elif alert["condition"] == "below" and q.price <= alert["threshold"]:
                hit = True
            elif alert["condition"] == "change_pct_above" and (q.change_pct or 0) >= alert["threshold"]:
                hit = True
            elif alert["condition"] == "change_pct_below" and (q.change_pct or 0) <= alert["threshold"]:
                hit = True

            if hit:
                alert["triggered"] = True
                alert["triggered_at"] = datetime.now(timezone.utc).isoformat()
                alert["trigger_price"] = q.price
                alert["trigger_change_pct"] = q.change_pct
                triggered.append(alert)
                modified = True
        except Exception:
            continue

    if modified:
        await r.set(key, json.dumps(alerts), ex=86400 * 30)

    return triggered
