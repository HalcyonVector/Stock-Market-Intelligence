"""
US economic calendar: official release dates, and how much the S&P 500
actually moved on past release days.

Dates
- FOMC decisions: the Federal Reserve's published meeting schedule (below;
  the next year's dates are marked tentative, as the Fed does).
- Data releases (CPI, jobs report, GDP, PPI, retail sales, PCE, jobless
  claims, housing starts): FRED's release calendar from the St. Louis Fed,
  which lists scheduled future dates. Needs a free FRED_API_KEY; without one
  only the FOMC dates are shown (no guessed dates).

Market impact
- "Avg S&P move" is measured, not assumed: the mean absolute daily return of
  SPY on that release's past dates (from the daily history the sync job
  stores), next to the mean absolute move on all days for comparison.

Free-tier budget: FRED is called at most twice a day (about 10 calls each),
and SPY history is one Redis read.
"""
from __future__ import annotations

import statistics
from datetime import date, datetime, timedelta, timezone

import httpx

from app.core import snapshot
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("services.economic_calendar")

FRED = "https://api.stlouisfed.org/fred"
KEY = "econ_calendar:v2"
TTL = 12 * 3600
HORIZON_DAYS = 60
FOMC_HORIZON_DAYS = 120  # meetings are ~6 weeks apart: always show the next two
HISTORY_DAYS = 400

# FOMC decision days (second day of each two-day meeting).
FOMC_DECISIONS = {
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
}
FOMC_TENTATIVE = {
    "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09",
    "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
}

# FRED release names are matched case-insensitively against /fred/releases,
# so no numeric release ids are hard-coded.
EVENTS = [
    {"name": "CPI Inflation Report", "fred": "consumer price index", "category": "inflation", "impact": "high",
     "description": "Consumer prices. The main inflation number; drives expectations for Fed rate decisions."},
    {"name": "Jobs Report (Nonfarm Payrolls)", "fred": "employment situation", "category": "employment", "impact": "high",
     "description": "Jobs added and the unemployment rate for the previous month."},
    {"name": "GDP", "fred": "gross domestic product", "category": "growth", "impact": "high",
     "description": "Quarterly economic growth (advance, second and third estimates)."},
    {"name": "PCE Inflation (Personal Income and Outlays)", "fred": "personal income and outlays", "category": "inflation",
     "impact": "high", "description": "The Fed's preferred inflation gauge, with consumer spending and income."},
    {"name": "PPI Producer Prices", "fred": "producer price index", "category": "inflation", "impact": "medium",
     "description": "Wholesale prices; often moves ahead of consumer inflation."},
    {"name": "Retail Sales", "fred": "advance monthly sales for retail and food services", "category": "consumer",
     "impact": "medium", "description": "Monthly consumer spending at stores and restaurants."},
    {"name": "Housing Starts", "fred": "new residential construction", "category": "housing", "impact": "low",
     "description": "New homes started; a read on the housing market."},
    {"name": "Initial Jobless Claims", "fred": "unemployment insurance weekly claims", "category": "employment",
     "impact": "low", "description": "Weekly new unemployment filings; an early labour-market signal."},
]
FOMC_EVENT = {
    "name": "FOMC Interest Rate Decision", "category": "monetary_policy", "impact": "high",
    "description": "The Federal Reserve's rate decision, released at 2:00 pm ET, followed by the chair's press conference.",
}


# ------------------------------------------------------------------ FRED
async def _fred(client: httpx.AsyncClient, path: str, **params) -> dict:
    r = await client.get(f"{FRED}/{path}", params={**params, "api_key": settings.FRED_API_KEY, "file_type": "json"})
    r.raise_for_status()
    return r.json()


def match_release_ids(releases: list[dict]) -> dict[str, int]:
    """FRED release list -> {our fred key: release id}, by exact name, else prefix."""
    by_name = {(r.get("name") or "").strip().lower(): r["id"] for r in releases if r.get("id")}
    out = {}
    for ev in EVENTS:
        key = ev["fred"]
        rid = by_name.get(key) or next((i for n, i in by_name.items() if n.startswith(key)), None)
        if rid:
            out[key] = rid
    return out


async def _fred_dates(today: date) -> dict[str, list[str]]:
    """{fred key: sorted release dates from HISTORY_DAYS ago to HORIZON_DAYS ahead}."""
    start = (today - timedelta(days=HISTORY_DAYS)).isoformat()
    end = (today + timedelta(days=HORIZON_DAYS)).isoformat()
    out: dict[str, list[str]] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        releases = (await _fred(client, "releases", limit=1000)).get("releases", [])
        for key, rid in match_release_ids(releases).items():
            try:
                data = await _fred(client, "release/dates", release_id=rid, realtime_start=start,
                                   realtime_end=end, include_release_dates_with_no_data="true",
                                   sort_order="asc", limit=1000)
                out[key] = sorted({d["date"] for d in data.get("release_dates", []) if d.get("date")})
            except Exception as e:  # noqa: BLE001
                log.warning("econ.fred_dates_failed", release=key, error=str(e)[:160])
    return out


# ------------------------------------------------------------ market impact
async def _spy_moves() -> dict[str, float]:
    """{date: abs % daily return of SPY} from the stored daily history."""
    from app.adapters import history_store
    from app.core.redis import get_redis

    try:
        raw = await get_redis().get(history_store.KEY.format(symbol="SPY"))
        bars = history_store.decode(raw, HISTORY_DAYS) if raw else None
    except Exception:  # noqa: BLE001
        bars = None
    if not bars or len(bars) < 30:
        return {}
    out = {}
    for prev, cur in zip(bars, bars[1:]):
        if prev.close:
            out[cur.ts.date().isoformat()] = abs(cur.close / prev.close - 1) * 100
    return out


def avg_move_on(dates: list[str], moves: dict[str, float], today: date) -> tuple[float | None, int]:
    past = [moves[d] for d in dates if d < today.isoformat() and d in moves]
    if len(past) < 3:
        return None, len(past)
    return round(statistics.mean(past), 2), len(past)


# ------------------------------------------------------------------ build
async def compute(today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    horizon = (today + timedelta(days=HORIZON_DAYS)).isoformat()
    moves = await _spy_moves()
    baseline = round(statistics.mean(moves.values()), 2) if moves else None

    fred: dict[str, list[str]] = {}
    if settings.FRED_API_KEY:
        try:
            fred = await _fred_dates(today)
        except Exception as e:  # noqa: BLE001
            log.warning("econ.fred_failed", error=str(e)[:160])

    events = []
    fomc_all = sorted(FOMC_DECISIONS | FOMC_TENTATIVE)
    avg, n = avg_move_on(fomc_all, moves, today)
    fomc_horizon = (today + timedelta(days=FOMC_HORIZON_DAYS)).isoformat()
    for d in fomc_all:
        if today.isoformat() <= d <= fomc_horizon:
            events.append({**FOMC_EVENT, "date": d, "date_source": "Federal Reserve schedule"
                           + (" (tentative)" if d in FOMC_TENTATIVE else ""),
                           "estimated": False, "avg_sp500_move": avg, "sample_days": n})

    for ev in EVENTS:
        dates = fred.get(ev["fred"])
        base = {k: v for k, v in ev.items() if k != "fred"}
        if not dates:
            continue  # no official date available: show nothing rather than a guess
        avg, n = avg_move_on(dates, moves, today)
        upcoming = [d for d in dates if today.isoformat() <= d <= horizon]
        # Weekly claims would flood the list: show only the next one.
        for d in upcoming[:1] if "weekly" in ev["fred"] else upcoming:
            events.append({**base, "date": d, "date_source": "FRED release calendar",
                           "estimated": False, "avg_sp500_move": avg, "sample_days": n})

    for e in events:
        e["days_until"] = (date.fromisoformat(e["date"]) - today).days
        e["estimated_date"] = e["date"]  # field name older clients read
    events.sort(key=lambda e: (e["days_until"], e["impact"] != "high"))
    return {
        "events": events,
        "categories": sorted({e["category"] for e in events}),
        "baseline_sp500_move": baseline,
        "dates_source": "FRED + Federal Reserve" if fred else "Federal Reserve (FOMC only)",
        "missing_releases": not fred,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def refresh_countdown(data: dict, today: date | None = None) -> dict:
    """The snapshot can be up to TTL old: recompute days_until from each date
    and drop events that have already happened."""
    today = today or datetime.now(timezone.utc).date()
    events = []
    for e in data.get("events", []):
        try:
            days = (date.fromisoformat(e["date"]) - today).days
        except (KeyError, ValueError):
            continue
        if days >= 0:
            events.append({**e, "days_until": days})
    return {**data, "events": events}


async def get_economic_calendar() -> dict:
    data = await snapshot.serve(KEY, compute, max_age=TTL, empty={"events": [], "categories": []})
    return refresh_countdown(data)
