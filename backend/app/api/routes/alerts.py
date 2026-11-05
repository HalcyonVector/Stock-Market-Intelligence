from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.config import settings
from app.services import alerts as svc

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    condition: Literal["above", "below", "change_pct_above", "change_pct_below"]
    threshold: float
    note: str = Field(default="", max_length=200)


@router.get("")
async def list_alerts(user: str = Depends(get_current_user)):
    return {"data": await svc.list_alerts(user)}


@router.post("")
async def create_alert(body: AlertCreate, user: str = Depends(get_current_user)):
    try:
        alert = await svc.create_alert(user, body.symbol, body.condition, body.threshold, body.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"data": alert}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, user: str = Depends(get_current_user)):
    await svc.delete_alert(user, alert_id)
    return {"status": "ok"}


@router.get("/check")
async def check_alerts(user: str = Depends(get_current_user)):
    """Check alerts against live prices. Returns newly triggered."""
    return {"data": await svc.check_alerts(user)}


# ---------------------------------------------------------------- Web Push
class PushKeys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class PushSubscription(BaseModel):
    endpoint: str = Field(max_length=1000)
    keys: PushKeys


class PushUnsubscribe(BaseModel):
    endpoint: str = Field(max_length=1000)


@router.get("/push")
async def push_status(user: str = Depends(get_current_user)):
    """Whether push is configured on the server, its public key, and how many
    devices this browser identity has subscribed."""
    from app.services import push

    return {"data": {
        "enabled": push.enabled(),
        "public_key": settings.VAPID_PUBLIC_KEY or None,
        "devices": await push.device_count(user) if push.enabled() else 0,
    }}


@router.post("/push")
async def push_subscribe(body: PushSubscription, user: str = Depends(get_current_user)):
    from app.services import push

    if not push.enabled():
        raise HTTPException(status_code=503, detail="Push notifications are not set up on this server")
    try:
        await push.subscribe(user, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"data": {"subscribed": True}}


@router.post("/push/unsubscribe")
async def push_unsubscribe(body: PushUnsubscribe, user: str = Depends(get_current_user)):
    from app.services import push

    await push.unsubscribe(user, body.endpoint)
    return {"data": {"subscribed": False}}


@router.post("/push/test")
async def push_test(user: str = Depends(get_current_user)):
    from app.services import push

    sent = await push.notify(user, "StockIntel test", "Notifications are working.", url="/alerts", tag="test")
    return {"data": {"sent": sent}}
