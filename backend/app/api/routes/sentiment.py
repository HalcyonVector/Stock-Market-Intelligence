from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.services import sentiment as svc

router = APIRouter(prefix="/sentiment", tags=["sentiment"])


@router.get("/trending")
async def trending(market: str = Depends(default_market), limit: int = 10):
    return {"data": await svc.trending(market, limit)}
