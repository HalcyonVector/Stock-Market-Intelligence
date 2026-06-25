"""
Earnings calendar — upcoming and recent earnings dates from yfinance.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.core.redis import get_redis

WATCHLIST = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
    "JPM", "V", "JNJ", "WMT", "PG", "XOM", "UNH", "HD",
    "BAC", "ABBV", "PFE", "KO", "COST", "MRK", "LLY", "AVGO",
    "CRM", "ADBE", "AMD", "NFLX", "INTC", "QCOM", "ORCL",
    "GS", "MS", "WFC", "DIS", "PYPL",
]


async def get_earnings_calendar() -> list[dict]:
    cache_key = "earnings:calendar"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    import yfinance as yf
    results = []
    now = datetime.now(timezone.utc)

    for sym in WATCHLIST:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info or {}
            cal = ticker.calendar

            entry = {
                "symbol": sym,
                "name": info.get("longName") or info.get("shortName") or sym,
                "sector": info.get("sector", ""),
            }

            # Get earnings dates
            if cal is not None and isinstance(cal, dict):
                ed = cal.get("Earnings Date")
                if ed and len(ed) > 0:
                    # yfinance returns list of Timestamps
                    dates = []
                    for d in ed:
                        try:
                            dt = d.to_pydatetime() if hasattr(d, 'to_pydatetime') else d
                            dates.append(str(dt)[:10])
                        except Exception:
                            pass
                    entry["earnings_dates"] = dates
                    if dates:
                        entry["next_earnings"] = dates[0]
                        try:
                            next_dt = datetime.strptime(dates[0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                            entry["days_until"] = (next_dt - now).days
                        except Exception:
                            entry["days_until"] = None

                # EPS estimates
                entry["eps_estimate"] = cal.get("Earnings Average")
                entry["eps_low"] = cal.get("Earnings Low")
                entry["eps_high"] = cal.get("Earnings High")
                entry["revenue_estimate"] = cal.get("Revenue Average")
            elif hasattr(cal, 'columns'):
                # DataFrame format
                try:
                    if 'Earnings Date' in cal.index:
                        dates = cal.loc['Earnings Date']
                        if hasattr(dates, 'tolist'):
                            entry["earnings_dates"] = [str(d)[:10] for d in dates.tolist()]
                except Exception:
                    pass

            # Historical earnings surprise
            try:
                hist = ticker.earnings_dates
                if hist is not None and len(hist) > 0:
                    surprises = []
                    for _, row in hist.head(4).iterrows():
                        surprise_pct = row.get("Surprise(%)")
                        eps_actual = row.get("Reported EPS")
                        eps_est = row.get("EPS Estimate")
                        if surprise_pct is not None:
                            surprises.append({
                                "date": str(row.name)[:10] if hasattr(row, 'name') else "",
                                "actual": float(eps_actual) if eps_actual is not None else None,
                                "estimate": float(eps_est) if eps_est is not None else None,
                                "surprise_pct": float(surprise_pct) if surprise_pct is not None else None,
                            })
                    entry["history"] = surprises
            except Exception:
                entry["history"] = []

            results.append(entry)
        except Exception:
            continue

    # Sort by next earnings date
    def sort_key(x):
        d = x.get("days_until")
        if d is None:
            return 9999
        return d

    results.sort(key=sort_key)

    try:
        await r.set(cache_key, json.dumps(results, default=str), ex=3600)
    except Exception:
        pass

    return results
