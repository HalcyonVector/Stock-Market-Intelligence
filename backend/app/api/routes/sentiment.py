from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.core.logging import get_logger
from app.services import sentiment as svc

log = get_logger("routes.sentiment")
router = APIRouter(prefix="/sentiment", tags=["sentiment"])


@router.get("/trending")
async def trending(market: str = Depends(default_market), limit: int = 10):
    try:
        return {"data": await svc.trending(market, limit)}
    except Exception as e:
        log.error("trending.error", error=str(e))
        return {"data": []}
