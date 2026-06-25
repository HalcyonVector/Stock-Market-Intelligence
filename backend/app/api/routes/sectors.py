from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.core.logging import get_logger
from app.services import sector as svc

log = get_logger("routes.sectors")
router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("/rotation")
async def rotation(market: str = Depends(default_market)):
    try:
        return {"data": await svc.rotation(market)}
    except Exception as e:
        log.error("rotation.error", error=str(e))
        return {"data": []}
