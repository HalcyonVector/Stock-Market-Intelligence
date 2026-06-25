from fastapi import APIRouter

from app.core.config import settings
from app.core.redis import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    redis_ok = False
    try:
        redis_ok = await get_redis().ping()
    except Exception:  # noqa: BLE001
        redis_ok = False
    return {
        "status": "ok",
        "env": settings.ENV,
        "data_mode": settings.DATA_MODE,
        "ai_provider": settings.AI_PROVIDER,
        "redis": redis_ok,
    }
