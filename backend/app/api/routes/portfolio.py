import json

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.redis import get_redis
from app.services import portfolio as svc
from app.services.rebalance import analyze_drift

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


class SavedPortfolio(BaseModel):
    name: str
    symbols: list[str]
    weights: dict[str, float] | None = None  # optional manual weights


@router.get("/analyze")
async def analyze(
    symbols: str = Query(default="", description="Comma-separated symbols"),
):
    """Run full portfolio optimization on given or default symbols."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] or None
    return {"data": await svc.analyze(sym_list)}


@router.get("/saved")
async def list_saved(user_id: str = "demo"):
    """List saved portfolios for a user."""
    r = get_redis()
    key = f"portfolios:{user_id}"
    try:
        raw = await r.get(key)
        return {"data": json.loads(raw) if raw else []}
    except Exception:
        return {"data": []}


@router.post("/saved")
async def save_portfolio(body: SavedPortfolio, user_id: str = "demo"):
    """Save a named portfolio."""
    r = get_redis()
    key = f"portfolios:{user_id}"
    try:
        raw = await r.get(key)
        portfolios = json.loads(raw) if raw else []
    except Exception:
        portfolios = []

    # Upsert by name
    entry = body.model_dump()
    portfolios = [p for p in portfolios if p["name"] != entry["name"]]
    portfolios.append(entry)

    await r.set(key, json.dumps(portfolios), ex=86400 * 30)  # 30 days
    return {"data": entry}


@router.delete("/saved/{name}")
async def delete_saved(name: str, user_id: str = "demo"):
    """Delete a saved portfolio."""
    r = get_redis()
    key = f"portfolios:{user_id}"
    try:
        raw = await r.get(key)
        portfolios = json.loads(raw) if raw else []
        portfolios = [p for p in portfolios if p["name"] != name]
        await r.set(key, json.dumps(portfolios), ex=86400 * 30)
    except Exception:
        pass
    return {"status": "ok"}


class RebalanceRequest(BaseModel):
    symbols: list[str]
    target_weights: dict[str, float]
    portfolio_value: float = 100000


@router.post("/rebalance")
async def rebalance(body: RebalanceRequest):
    """Analyze drift and suggest rebalancing trades."""
    return {"data": await analyze_drift(body.symbols, body.target_weights, body.portfolio_value)}
