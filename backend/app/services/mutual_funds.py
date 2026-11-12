"""
Indian mutual fund lookup for the "My mutual funds" tracker.

Data: mfapi.in, a free, keyless mirror of AMFI's daily NAV files. NAVs change
once a day, so scheme data is cached in memory for 6 hours (and the routes
sit under the edge-cached /invest prefix): a fund costs one upstream request
per server per 6 hours however many people track it, and no Redis at all.
Holdings themselves stay in the visitor's browser.
"""
from __future__ import annotations

import time
from datetime import date, datetime

import httpx

from app.core.logging import get_logger

log = get_logger("services.mutual_funds")

SEARCH_URL = "https://api.mfapi.in/mf/search"
SCHEME_URL = "https://api.mfapi.in/mf/{code}"
_TTL = 6 * 3600
_MAX_CACHE = 300
_cache: dict[str, tuple[float, object]] = {}


def _get(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    return None


def _put(key: str, value) -> None:
    if len(_cache) >= _MAX_CACHE:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        _cache.pop(oldest, None)
    _cache[key] = (time.monotonic(), value)


def _parse(rows: list[dict]) -> list[tuple[date, float]]:
    """mfapi rows are newest-first {"date": "dd-mm-yyyy", "nav": "123.45"}; return oldest-first."""
    out = []
    for row in rows:
        try:
            nav = float(row["nav"])
            if nav > 0:
                out.append((datetime.strptime(row["date"], "%d-%m-%Y").date(), nav))
        except (KeyError, ValueError, TypeError):
            continue
    out.sort()
    return out


def _nav_on_or_before(series: list[tuple[date, float]], target: date) -> tuple[date, float] | None:
    lo, hi, best = 0, len(series) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        if series[mid][0] <= target:
            best = series[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def trailing_returns(series: list[tuple[date, float]]) -> dict[str, float | None]:
    """Point-to-point return for 1y and annualised (CAGR) for 3y/5y."""
    if not series:
        return {"1y": None, "3y": None, "5y": None}
    last_d, last_nav = series[-1]
    out: dict[str, float | None] = {}
    for label, years in (("1y", 1), ("3y", 3), ("5y", 5)):
        try:
            target = last_d.replace(year=last_d.year - years)
        except ValueError:  # 29 Feb
            target = last_d.replace(year=last_d.year - years, day=28)
        past = _nav_on_or_before(series, target)
        if not past or (target - past[0]).days > 10 or past[0] < series[0][0]:
            out[label] = None
            continue
        out[label] = round(((last_nav / past[1]) ** (1 / years) - 1) * 100, 2)
    return out


def _monthly(series: list[tuple[date, float]], years: int = 5) -> list[dict]:
    if not series:
        return []
    cutoff = series[-1][0].replace(year=series[-1][0].year - years)
    by_month: dict[tuple[int, int], tuple[date, float]] = {}
    for d, nav in series:
        if d >= cutoff:
            by_month[(d.year, d.month)] = (d, nav)  # last NAV of each month
    pts = [{"date": d.isoformat(), "nav": round(n, 4)} for d, n in sorted(by_month.values())]
    if pts and pts[-1]["date"] != series[-1][0].isoformat():
        pts.append({"date": series[-1][0].isoformat(), "nav": round(series[-1][1], 4)})
    return pts


async def search(q: str, limit: int = 20) -> list[dict]:
    q = " ".join(q.split())[:60]
    if len(q) < 3:
        return []
    key = f"s:{q.lower()}"
    hit = _get(key)
    if hit is not None:
        return hit
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(SEARCH_URL, params={"q": q})
            r.raise_for_status()
            rows = r.json() or []
    except Exception as e:  # noqa: BLE001
        log.warning("mf.search_failed", q=q, error=str(e)[:160])
        return []
    # Growth options first: IDCW/dividend NAVs drop at every payout, so their
    # NAV history understates what an investor actually earned.
    def rank(row):
        name = (row.get("schemeName") or "").lower()
        return ("idcw" in name or "dividend" in name, "direct" not in name, name)

    out = [{"code": row["schemeCode"], "name": row.get("schemeName", "")}
           for row in sorted(rows, key=rank) if row.get("schemeCode")][:limit]
    _put(key, out)
    return out


async def scheme(code: int) -> dict | None:
    key = f"c:{code}"
    hit = _get(key)
    if hit is not None:
        return hit
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(SCHEME_URL.format(code=code))
            r.raise_for_status()
            payload = r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("mf.scheme_failed", code=code, error=str(e)[:160])
        return None
    meta = payload.get("meta") or {}
    series = _parse(payload.get("data") or [])
    if not series:
        return None
    out = {
        "code": code,
        "name": meta.get("scheme_name", str(code)),
        "fund_house": meta.get("fund_house"),
        "category": meta.get("scheme_category"),
        "nav": series[-1][1],
        "nav_date": series[-1][0].isoformat(),
        "returns": trailing_returns(series),
        "history": _monthly(series),
    }
    _put(key, out)
    return out
