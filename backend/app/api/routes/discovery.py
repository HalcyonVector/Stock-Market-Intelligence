from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.services import discovery as svc

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("")
async def scan(market: str = Depends(default_market)):
    return {"data": await svc.scan(market)}


@router.get("/buckets")
async def buckets(market: str = Depends(default_market)):
    return {"data": await svc.buckets(market)}
