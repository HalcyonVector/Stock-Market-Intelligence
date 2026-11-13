"""
Earnings calendar — upcoming and recent earnings dates.
Mock mode returns synthetic data; live mode uses yfinance.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import settings

async def get_earnings_calendar() -> list[dict]:
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

    # ── Live mode ────────────────────────────────────────────
    # Yahoo blocks Render's IPs, so instead of calling yfinance here this
    # reads the earnings dates the GitHub Actions job syncs daily for every
    # tracked stock (US and NSE) plus watchlist extras (scripts/sync_events.py).
    from app.adapters.history_store import is_indian
    from app.services import events as events_svc
    from app.services.heatmap import SECTOR_MAP

    data = await events_svc._load()
    today = datetime.now(timezone.utc).date()
    results = []
    for sym, ev in data.items():
        d = ev.get("earnings")
        if not d:
            continue
        try:
            days = (datetime.strptime(d, "%Y-%m-%d").date() - today).days
        except ValueError:
            continue
        if days < 0 or days > 45:
            continue
        results.append({
            "symbol": sym,
            "name": SECTOR_MAP.get(sym, ""),  # the card's subtitle line
            "sector": SECTOR_MAP.get(sym, ""),
            "market": "IN" if is_indian(sym) else "US",
            "currency": "INR" if is_indian(sym) else "USD",
            "next_earnings": d,
            "days_until": days,
            "eps_estimate": ev.get("eps_estimate"),
            "history": [],
        })
    results.sort(key=lambda x: (x["days_until"], x["symbol"]))
    return results[:30]
