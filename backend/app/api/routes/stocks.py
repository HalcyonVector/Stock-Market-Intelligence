from fastapi import APIRouter, Query

from app.adapters.registry import providers
from app.services import sentiment as sentiment_svc
from app.services import technicals, fundamentals, deep_research
from app.services.explain import why_moving
from app.services.forecast import forecast_price

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/search")
async def search(q: str = Query("", max_length=20)):
    """Find any US or NSE/BSE stock: the tracked universe first, then Finnhub."""
    from app.services.symbols import search as search_symbols

    return {"data": await search_symbols(q)}


@router.get("/{symbol}")
async def overview(symbol: str):
    symbol = symbol.upper()
    profile = await providers.market.profile(symbol)
    quote = await providers.market.quote(symbol)
    news = await providers.news.latest(symbol, limit=8)
    return {"data": {
        "profile": profile.__dict__,
        "quote": quote.__dict__,
        "news": [n.__dict__ for n in news],
    }}


@router.get("/{symbol}/risk")
async def risk(symbol: str):
    """1-year return, volatility, drawdown, beta vs benchmark and sector medians."""
    from app.services.risk import profile

    return {"data": await profile(symbol)}


@router.get("/{symbol}/why")
async def why(symbol: str):
    """Flagship: Why is this stock moving?"""
    return {"data": await why_moving(symbol.upper())}


@router.get("/{symbol}/technicals")
async def tech(symbol: str):
    """Technical indicators: RSI, MACD, Bollinger, SMA/EMA, ATR, Stochastic, OBV."""
    return {"data": await technicals.compute(symbol.upper())}


@router.get("/{symbol}/fundamentals")
async def funds(symbol: str):
    """Fundamental data from yfinance."""
    return {"data": await fundamentals.get_fundamentals(symbol.upper())}


@router.get("/{symbol}/research")
async def research(symbol: str):
    """AI deep research — comprehensive analysis."""
    return {"data": await deep_research.analyze(symbol.upper())}


@router.get("/{symbol}/forecast")
async def forecast(symbol: str, days: int = 30):
    """ML price forecast with confidence intervals."""
    return {"data": await forecast_price(symbol.upper(), days)}
