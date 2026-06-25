from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel

from app.services.backtester import backtest_strategy, list_strategies

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.get("/strategies")
async def strategies():
    """List available backtesting strategies."""
    return {"data": list_strategies()}


class BacktestRequest(BaseModel):
    symbol: str
    strategy: str = "rsi_oversold"
    params: dict | None = None
    initial_capital: float = 10000
    lookback: int = 365


@router.post("")
async def run_backtest(body: BacktestRequest):
    """Run a strategy backtest on a symbol."""
    return {"data": await backtest_strategy(
        body.symbol, body.strategy, body.params,
        body.initial_capital, body.lookback,
    )}
