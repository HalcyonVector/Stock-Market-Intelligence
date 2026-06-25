from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional

from app.services.safe_invest import (
    INSTRUMENTS, RATES_AS_OF, RISK_PROFILES, sip_calculator, goal_planner, ai_advise, allocation_calc,
)

router = APIRouter(prefix="/invest", tags=["invest"])


@router.get("/instruments")
async def instruments(country: str = Query("IN")):
    """List safe investment instruments for a country."""
    data = INSTRUMENTS.get(country.upper(), INSTRUMENTS["IN"])
    return {"data": data, "rates_as_of": RATES_AS_OF}


@router.get("/profiles")
async def profiles():
    """List risk profiles."""
    return {"data": RISK_PROFILES}


@router.get("/sip")
async def sip(
    monthly: float = Query(1000),
    rate: float = Query(7.0),
    years: int = Query(10),
    step_up: float = Query(0),
    lump_sum: float = Query(0),
):
    """SIP calculator with optional one-time lump sum and annual step-up."""
    return {"data": sip_calculator(monthly, rate, years, step_up, lump_sum)}


@router.get("/goal")
async def goal(
    target: float = Query(100000),
    years: int = Query(5),
    rate: float = Query(7.0),
):
    """Goal planner — how much to invest monthly."""
    return {"data": goal_planner(target, years, rate)}


class AllocationItem(BaseModel):
    instrument_id: str
    pct: float

class AllocationRequest(BaseModel):
    total_monthly: float = 1000
    allocations: list[AllocationItem]
    years: int = 10
    country: str = "IN"
    lump_sum: float = 0

@router.post("/allocate")
async def allocate(body: AllocationRequest):
    """Calculate combined returns from a multi-instrument allocation."""
    return {"data": allocation_calc(
        body.total_monthly,
        [a.model_dump() for a in body.allocations],
        body.years,
        body.country,
        lump_sum=body.lump_sum,
    )}


class AdvisorRequest(BaseModel):
    question: str
    risk_profile: str = "ultra_safe"
    monthly_amount: float = 1000
    country: str = "IN"
    age: str = "student"


@router.post("/advise")
async def advise(body: AdvisorRequest):
    """AI-powered investment advice for beginners."""
    response = await ai_advise(body.question, {
        "risk_profile": body.risk_profile,
        "monthly_amount": body.monthly_amount,
        "country": body.country,
        "age": body.age,
    })
    return {"data": {"answer": response}}
