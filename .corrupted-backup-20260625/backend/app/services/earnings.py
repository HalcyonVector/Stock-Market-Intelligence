"""
Earnings calendar — upcoming and recent earnings dates.
Mock mode returns synthetic data; live mode uses yfinance.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.core.config import settings
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

    # ── Mock mode ──────────────────────────────────────────────
    if settings.DATA_MODE == "mock":
        now = datetime.now(timezone.utc)
        mock_stocks = [
            ("AAPL", "Apple Inc.", "Technology", 2.18, 2.10),
            ("MSFT", "Microsoft Corp.", "Technology", 3.22, 3.15),
            ("NVDA", "NVIDIA Corp.", "Technology", 0.82, 0.74),
            ("GOOGL", "Alphabet Inc.", "Technology", 2.01, 1.89),
            ("AMZN", "Amazon.com Inc.", "Consumer", 1.36, 1.29),
            ("META", "Meta Platforms", "Technology", 6.03, 5.85),
            ("TSLA", "Tesla Inc.", "Auto", 0.85, 0.71),
            ("JPM", "JPMorgan Chase", "Financials", 4.81, 4.63),
            ("V", "Visa Inc.", "Financials", 2.56, 2.49),
            ("JNJ", "Johnson & Johnson", "Healthcare", 2.71, 2.64),
        ]
        mock_data = []
        for i, (sym, name, sector, eps_est, eps_last) in enumerate(mock_stocks):
            days = i * 3 + 1
            surprise = round((eps_last - eps_est + 0.15) / eps_est * 100, 1)
            mock_data.append({
                "symbol": sym,
                "name": name,
                "sector": sector,
                "next_earnings": (now + timedelta(days=days)).strftime("%Y-%m-%d"),
                "days_until": days,
                "eps_estimate": eps_est,
                "eps_low": round(eps_est * 0.9, 2),
                "eps_high": round(eps_est * 1.1, 2),
                "history": [
                    {
                        "date": (now - timedelta(days=90)).strftime("%Y-%m-%d"),
                        "actual": eps_last,
                        "estimate": eps_est,
                        "surprise_pct": surprise,
                    },
                    {
                        "date": (now - timedelta(days=180)).strftime("%Y-%m-%d"),
                        "actual": round(eps_last * 0.95, 2),
                        "estimate": round(eps_est * 0.97, 2),
                        "surprise_pct": round(surprise - 1.2, 1),
                    },
                ],
            })
        return mock_data

    # ── Live mode (yfinance) ───────────────────────────────────
    import yfinance as yf

    results = []
    now = datetime.now(timezone.utc)

    for sym in WATCHLIST:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info or {}
            cal = ticker.calendar

            entry: dict = {
                "symbol": sym,
                "name": info.get("longName") or info.get("shortName") or sym,
                "sector": info.get("sector", ""),
            }

            if cal is not None and isinstance(cal, dict):
                ed = cal.get("Earnings Date")
                if ed and len(ed) > 0:
                    dates = []
                    for d in ed:
                        try:
                            dt = d.to_pydatetime() if hasattr(d, "to_pydatetime") else d
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

                entry["eps_estimate"] = cal.get("Earnings Average")
                entry["eps_low"] = cal.get("Earnings Low")
                entry["eps_high"] = cal.get("Earnings High")
                entry["revenue_estimate"] = cal.get("Revenue Average")

            elif hasattr(cal, "columns"):
                try:
                    if "Earnings Date" in cal.index:
                        dates = cal.loc["Earnings Date"]
                        if hasattr(dates, "tolist"):
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
                                "date": str(row.name)[:10] if hasattr(row, "name") else "",
                                "actual": float(eps_actual) if eps_actual is not None else None,
                                "estimate": float(eps_est) if eps_est is not None else None,
                                "surprise_pct": float(surprise_pct),
                            })
                    entry["history"] = surprises
            except Exception:
                entry["history"] = []

            results.append(entry)
        except Exception:
            continue

    results.sort(key=lambda x: x.get("days_until") if x.get("days_until") is not None else 9999)

    try:
        await r.set(cache_key, json.dumps(results, default=str), ex=3600)
    except Exception:
        pass

    return results
