from fastapi import APIRouter, Depends

from app.adapters.registry import providers
from app.api.deps import default_market
from app.core.logging import get_logger
from app.services import briefing as svc
from app.services.earnings import get_earnings_calendar
from app.services.economic_calendar import get_economic_calendar
from app.services.insider import get_insider_activity

log = get_logger("routes.insights")
router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/briefing")
async def briefing(market: str = Depends(default_market)):
    return {"data": await svc.daily(market)}


@router.get("/news")
async def news(limit: int = 20):
    """General market news feed (not symbol-specific)."""
    items = await providers.news.latest(symbol=None, limit=limit)
    return {"data": [n.__dict__ for n in items]}


@router.get("/earnings")
async def earnings():
    """Upcoming earnings calendar with historical surprise data."""
    return {"data": await get_earnings_calendar()}


@router.get("/economic-calendar")
async def economic_calendar():
    """Upcoming economic events with impact ratings."""
    return {"data": await get_economic_calendar()}


@router.get("/insider-activity")
async def insider_activity(market: str = Depends(default_market), limit: int = 15):
    """Recent insider buys/sells from tracked universe."""
    try:
        return {"data": await get_insider_activity(market, limit)}
    except Exception as e:
        log.error("insider.error", error=str(e))
        return {"data": []}
