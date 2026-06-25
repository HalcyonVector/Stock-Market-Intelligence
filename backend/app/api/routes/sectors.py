from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.services import sector as svc

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("/rotation")
async def rotation(market: str = Depends(default_market)):
    return {"data": await svc.rotation(market)}
