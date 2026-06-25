from fastapi import APIRouter, Depends, Query

from app.api.deps import default_market
from app.services import market as svc
from app.services.heatmap import get_heatmap_data

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/quote/{symbol}")
async def quote(symbol: str):
    return {"data": await svc.get_quote(symbol.upper())}


@router.get("/movers")
async def movers(market: str = Depends(default_market), limit: int = 10):
    return {"data": await svc.get_movers(market, limit)}


@router.get("/candles/{symbol}")
async def candles(symbol: str, interval: str = "1d", lookback: int = Query(90, le=365)):
    return {"data": await svc.get_candles(symbol.upper(), interval=interval, lookback=lookback)}


@router.get("/heatmap")
async def heatmap():
    return {"data": await get_heatmap_data()}
