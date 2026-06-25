from fastapi import APIRouter, Depends

from app.api.deps import default_market
from app.core.logging import get_logger
from app.services import sector as svc

log = get_logger("routes.sectors")
router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("/rotation")
async def rotation(market: str =