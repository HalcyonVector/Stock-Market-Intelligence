from fastapi import APIRouter, Query
from typing import Optional

from app.services.screener import screen

router = APIRouter(prefix="/screener", tags=["screener"])


@router.get("")
async def run_screener(
    change_pct_min: Optional[float] = Query(None),
    change_pct_max: Optional[float] = Query(None),
    rsi_min: Optional[float] = Query(None),
    rsi_max: Optional[float] = Query(None),
    volume_ratio_min: Optional[float] = Query(None),
    volume_ratio_max: Optional[float] = Query(None),
    pe_min: Optional[float] = Query(None),
    pe_max: Optional[float] = Query(None),
    market_cap_min: Optional[float] = Query(None, description="Billions USD"),
    market_cap_max: Optional[float] = Query(None, description="Billions USD"),
    sector: Optional[str] = Query(None),
):
    filters = {}
    for k, v in {
        "change_pct_min": change_pct_min, "change_pct_max": change_pct_max,
        "rsi_min": rsi_min, "rsi_max": rsi_max,
        "volume_ratio_min": volume_ratio_min, "volume_ratio_max": volume_ratio_max,
        "pe_min": pe_min, "pe_max": pe_max,
        "market_cap_min": market_cap_min, "market_cap_max": market_cap_max,
        "sector": sector,
    }.items():
        if v is not None:
            filters[k] = v

    results = await screen(filters)
    return {"data": results, "count": len(results), "filters": filters}
