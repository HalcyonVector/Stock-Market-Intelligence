from fastapi import APIRouter, Depends

from app.adapters.registry import providers
from app.api.deps import default_market
from app.services import briefing as svc
from app.services.earnings import get_earnings_calendar
from app.services.economic_calendar import get_economic_calendar

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
