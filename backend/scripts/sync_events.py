"""
Upcoming earnings and dividend dates for every tracked stock (US + NSE) plus
the extra watchlist symbols, fetched with yfinance and stored as ONE Redis key
(``events:v1``) for the API's watchlist page.

Runs from the same GitHub Actions workflow as sync_history.py (Yahoo blocks
Render's IPs). Finnhub's free plan has no dividend data and no NSE coverage,
which is why this lives here.

    cd backend && REDIS_URL=rediss://... python -m scripts.sync_events

Free-tier cost: 1 Upstash command per run.
"""
from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

import redis
import yfinance as yf

from scripts.sync_history import extras, universe, yahoo_symbol

KEY = "events:v1"
WORKERS = 6


def _iso(v) -> str | None:
    if isinstance(v, (list, tuple)):
        v = v[0] if v else None
    if isinstance(v, datetime):
        v = v.date()
    return v.isoformat() if isinstance(v, date) else None


def fetch(sym: str) -> tuple[str, dict | None]:
    try:
        cal = yf.Ticker(yahoo_symbol(sym)).calendar or {}
    except Exception:  # noqa: BLE001 -- missing/odd calendar: skip this symbol
        return sym, None
    if not isinstance(cal, dict):
        return sym, None
    ev = {
        "earnings": _iso(cal.get("Earnings Date")),
        "ex_dividend": _iso(cal.get("Ex-Dividend Date")),
        "dividend": _iso(cal.get("Dividend Date")),
    }
    eps = cal.get("Earnings Average")
    if isinstance(eps, (int, float)):
        ev["eps_estimate"] = round(float(eps), 3)
    return sym, ev if any(ev.values()) else None


def main() -> int:
    url = os.environ.get("REDIS_URL")
    if not url:
        print("REDIS_URL is not set", file=sys.stderr)
        return 2
    r = redis.Redis.from_url(url, socket_timeout=20, socket_connect_timeout=20)
    syms = universe() + extras(r)
    with ThreadPoolExecutor(WORKERS) as pool:
        results = dict(pool.map(fetch, syms))
    events = {s: ev for s, ev in results.items() if ev}
    if not events:
        print("no events fetched; keeping the previous data", file=sys.stderr)
        return 1
    r.set(KEY, json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(), "events": events,
    }, separators=(",", ":")))
    print(f"stored events for {len(events)}/{len(syms)} symbols")
    return 0


if __name__ == "__main__":
    sys.exit(main())
