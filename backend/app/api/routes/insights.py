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


@router.get("/events")
async def events(symbols: str = "", days: int = 90):
    """Upcoming earnings / ex-dividend / dividend dates for the given symbols
    (comma-separated), from the daily GitHub Actions sync."""
    from app.services.events import for_symbols

    syms = [s for s in symbols.split(",") if s.strip()]
    return {"data": await for_symbols(syms, max(1, min(days, 365)))}


@router.get("/economic-calendar")
async def economic_calendar():
    """Upcoming economic events with impact ratings."""
    return {"data": await get_economic_calendar()}


@router.get("/study")
async def study():
    """Market Study: returns, risk and cross-market statistics for the tracked
    universe, recomputed weekly by the GitHub Actions job."""
    from app.services.study import get_study

    return {"data": await get_study()}


@router.get("/analyst-ratings")
async def analyst_ratings():
    """Wall Street analyst consensus (Finnhub recommendation trends) for tracked US stocks."""
    from app.services.analyst_ratings import get_ratings

    try:
        return {"data": await get_ratings()}
    except Exception as e:  # noqa: BLE001
        log.error("analyst.error", error=str(e))
        return {"data": []}


@router.get("/insider-activity")
async def insider_activity(market: str = Depends(default_market), limit: int = 15):
    """Recent insider buys/sells from tracked universe."""
    try:
        return {"data": await get_insider_activity(market, limit)}
    except Exception as e:
        log.error("insider.error", error=str(e))
        return {"data": []}
