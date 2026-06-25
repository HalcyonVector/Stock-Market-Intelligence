from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.services import alerts as svc

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    symbol: str
    condition: str  # above, below, change_pct_above, change_pct_below
    threshold: float
    note: str = ""


@router.get("")
async def list_alerts(user: str = Depends(get_current_user)):
    return {"data": await svc.list_alerts(user)}


@router.post("")
async def create_alert(body: AlertCreate, user: str = Depends(get_current_user)):
    return {"data": await svc.create_alert(user, body.symbol, body.condition, body.threshold, body.note)}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, user: str = Depends(get_current_user)):
    await svc.delete_alert(user, alert_id)
    return {"status": "ok"}


@router.get("/check")
async def check_alerts(user: str = Depends(get_current_user)):
    """Check alerts against live prices. Returns newly triggered."""
    return {"data": await svc.check_alerts(user)}
