"""
Live rate overlay for the Safe Investment Guide.

The static entries in ``safe_invest.INSTRUMENTS`` are hand-maintained and drift
out of date the moment a rate changes. Where a free, keyless public API
exists, this module fetches the real current number and overlays it on the
static entry -- using the same durable stale-while-revalidate cache pattern as
``services.discovery`` (see ``app.core.snapshot``), so a slow or down upstream
never blocks a request; the last good value is always served instantly.

Coverage:
  - Indian mutual-fund categories (liquid / short-duration debt / ELSS / index
    / arbitrage / gilt / banking & PSU debt): a trailing 1-year return is
    computed from real historical NAV data via mfapi.in -- a free, keyless
    wrapper around AMFI's official public NAV feed. The scheme code for the
    representative fund is *resolved by name search* against mfapi.in at fetch
    time rather than hardcoded, so a stale/wrong scheme ID can't silently creep
    in -- if the name lookup fails, that category is skipped (falls back to
    the static estimate) instead of guessing.
  - US Treasury Bills: the average interest rate from Treasury.gov's official,
    free, keyless FiscalData API.

Anything without a reliable free feed stays on the curated static table:
  - Bank/small-finance-bank/corporate FD rates vary by issuer with no fixed
    revision schedule and no single free API covers them.
  - Indian government small-savings rates (PPF, NSC, SCSS, SSY, KVP, POMIS,
    POTD) are revised quarterly by Finance Ministry circular, not published as
    an API -- these need a periodic manual/scheduled refresh of
    ``RATES_AS_OF``, not a live poll.

Every overridden instrument also carries ``rate_source`` and ``rate_as_of`` so
the UI can be honest about which numbers are live vs. static, instead of
presenting a hardcoded guess as if it were current.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.core import snapshot
from app.core.logging import get_logger

log = get_logger("services.live_rates")

# These categories don't move intraday -- a NAV/yield poll every few hours is
# already far fresher than the static table it replaces.
_REFRESH_SECONDS = 6 * 3600
_TIMEOUT = 8.0
_SNAPSHOT_KEY = "live_rates:v1"

# Instrument-id -> representative fund name for that category. Resolved to a
# scheme code via mfapi.in's search endpoint at fetch time (not hardcoded).
MF_CATEGORY_FUNDS: dict[str, str] = {
    "liquid_fund": "HDFC Liquid Fund - Growth Option - Direct Plan",
    "debt_fund": "ICICI Prudential Short Term Fund - Direct Plan - Growth Option",
    "elss": "Parag Parikh ELSS Tax Saver Fund- Direct Growth",
    "index_fund": "UTI Nifty 50 Index Fund - Growth Option- Direct",
    "arbitrage_fund": "Nippon India Arbitrage Fund - Direct Plan Growth Plan - Growth Option",
    "gilt_fund": "Kotak Gilt-Savings-Growth - Direct",
    "banking_psu_fund": "Aditya Birla Sun Life Banking & PSU Debt Fund - Growth - Direct Plan",
    "overnight_fund": "HDFC Overnight Fund - Growth Option - Direct Plan",
    "ultra_short_fund": "ICICI Prudential Ultra Short Term Fund - Direct Plan -  Growth",
    "corporate_bond_fund": "HDFC Corporate Bond Fund - Growth Option - Direct Plan",
    "hybrid_conservative": "Navi Conservative Hybrid Fund-Direct Plan-Growth Option",
    "multi_asset_fund": "ICICI Prudential Multi-Asset Fund - Direct Plan - Growth",
}

US_TREASURY_SECURITY_DESC = "Treasury Bills"

MFAPI_SEARCH_URL = "https://api.mfapi.in/mf/search"
MFAPI_SCHEME_URL = "https://api.mfapi.in/mf/{code}"
TREASURY_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
    "v2/accounting/od/avg_interest_rates"
)


def _parse_date(s: str) -> datetime:
    return datetime.strptime(s, "%d-%m-%Y")


def _trailing_return_pct(nav_rows: list[dict], days: int) -> float | None:
    """Annualized % return from the NAV ~``days`` ago to the latest NAV.

    ``nav_rows`` is mfapi.in's ``data`` list, newest-first.
    """
    if len(nav_rows) < 2:
        return None
    latest = nav_rows[0]
    try:
        latest_date = _parse_date(latest["date"])
        latest_nav = float(latest["nav"])
    except (KeyError, ValueError):
        return None

    target = latest_date - timedelta(days=days)
    old_row = next(
        (row for row in nav_rows[1:] if _safe_parse(row) and _parse_date(row["date"]) <= target),
        nav_rows[-1],  # not enough history -- use the oldest we have
    )
    try:
        old_nav = float(old_row["nav"])
    except (KeyError, ValueError):
        return None
    if old_nav <= 0:
        return None

    years = days / 365.0
    ratio = latest_nav / old_nav
    if years >= 0.95:
        return round((ratio ** (1 / years) - 1) * 100, 2)
    return round((ratio - 1) * 100, 2)


def _safe_parse(row: dict) -> bool:
    try:
        _parse_date(row["date"])
        return True
    except (KeyError, ValueError):
        return False


def _norm(s: str) -> str:
    return " ".join(s.strip().lower().split())


async def _resolve_scheme_code(client: httpx.AsyncClient, fund_name: str) -> int | None:
    r = await client.get(MFAPI_SEARCH_URL, params={"q": fund_name}, timeout=_TIMEOUT)
    r.raise_for_status()
    results = r.json() or []
    if not results:
        return None

    target = _norm(fund_name)
    for row in results:
        if _norm(row.get("schemeName", "")) == target:
            return row["schemeCode"]

    # No exact match -- AMFI scheme names have inconsistent spacing/hyphens
    # across AMCs, so an exact-string miss is common even for the right fund.
    # Only fall back to a Direct Plan *Growth* option (never a dividend/IDCW
    # variant, which has a structurally different NAV trend, and never a
    # "Regular Plan", which carries a different expense ratio) -- if none of
    # the search hits are unambiguously that, skip the category rather than
    # attach a plausible-looking but wrong fund's NAV to it.
    for row in results:
        name = row.get("schemeName", "").lower()
        if "direct" in name and "growth" in name and "idcw" not in name and "dividend" not in name:
            return row["schemeCode"]
    return None


async def _fetch_mf_rate(client: httpx.AsyncClient, category: str, fund_name: str) -> dict[str, Any] | None:
    try:
        code = await _resolve_scheme_code(client, fund_name)
        if not code:
            log.warning("live_rates.mf_no_match", category=category, fund_name=fund_name)
            return None
        r = await client.get(MFAPI_SCHEME_URL.format(code=code), timeout=_TIMEOUT)
        r.raise_for_status()
        payload = r.json()
        rows = payload.get("data") or []
        rate = _trailing_return_pct(rows, 365)
        if rate is None or rate <= 0:
            return None
        return {
            "current_rate": rate,
            "rate_source": "mfapi.in (AMFI NAV, trailing 1Y, annualized)",
            "reference_fund": payload.get("meta", {}).get("scheme_name", fund_name),
            "rate_as_of": rows[0]["date"],
        }
    except Exception as e:  # noqa: BLE001 -- one failed category must not sink the rest
        log.warning("live_rates.mf_fetch_failed", category=category, error=str(e))
        return None


async def _fetch_treasury_rate(client: httpx.AsyncClient) -> dict[str, Any] | None:
    try:
        r = await client.get(
            TREASURY_URL,
            params={
                "filter": f"security_desc:eq:{US_TREASURY_SECURITY_DESC}",
                "sort": "-record_date",
                "page[size]": 1,
            },
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        rows = r.json().get("data") or []
        if not rows:
            return None
        return {
            "current_rate": round(float(rows[0]["avg_interest_rate_amt"]), 2),
            "rate_source": "treasury.gov FiscalData (avg interest rate, Treasury Bills)",
            "rate_as_of": rows[0]["record_date"],
        }
    except Exception as e:  # noqa: BLE001
        log.warning("live_rates.treasury_fetch_failed", error=str(e))
        return None


async def _compute_all() -> dict[str, dict[str, Any]]:
    """Fetch every live-able category. Runs on a background refresh, never on
    the request path -- see ``app.core.snapshot``."""
    out: dict[str, dict[str, Any]] = {}
    async with httpx.AsyncClient() as client:
        for category, fund_name in MF_CATEGORY_FUNDS.items():
            result = await _fetch_mf_rate(client, category, fund_name)
            if result:
                out[category] = result
        treasury = await _fetch_treasury_rate(client)
        if treasury:
            out["treasury"] = treasury
    return out


async def get_live_overrides() -> dict[str, dict[str, Any]]:
    """Instrument-id -> live override dict (``current_rate``, ``rate_source``,
    ``rate_as_of``). Always returns instantly from the last good snapshot;
    kicks a background refresh when stale. Empty dict (all-static fallback)
    if nothing has ever succeeded yet."""
    return await snapshot.serve(
        _SNAPSHOT_KEY,
        _compute_all,
        max_age=_REFRESH_SECONDS,
        empty={},
    )
