"""
Fundamental data extraction via yfinance.

P/E, EPS, revenue, margins, debt/equity, dividend yield, book value, etc.
Falls back gracefully when data is unavailable.  Mock mode returns deterministic
synthetic values so the comparison table is never empty.
"""
from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime, timezone

from app.core.config import settings
from app.core.redis import get_redis

CACHE_TTL = 1800  # 30 minutes


def _safe(info: dict, key: str, default=None):
    v = info.get(key, default)
    return v if v is not None else default


def _mock_fundamentals(symbol: str) -> dict:
    """Deterministic but realistic-looking fundamentals seeded from symbol."""
    h = int(hashlib.sha256(symbol.encode()).hexdigest(), 16) % (2**32)
    r = random.Random(h)

    price = round(20 + r.random() * 480, 2)
    shares = int(r.uniform(500e6, 5e9))
    mcap = round(price * shares)
    revenue = round(r.uniform(5e9, 200e9))
    eps = round(r.uniform(1.5, 25), 2)
    pe = round(price / eps, 2) if eps > 0 else None
    bv = round(r.uniform(10, 120), 2)
    div_yield = round(r.uniform(0, 0.035), 4) if r.random() > 0.3 else None
    beta = round(r.uniform(0.6, 1.8), 2)
    gross_margin = round(r.uniform(0.30, 0.75), 4)
    profit_margin = round(r.uniform(0.05, 0.35), 4)
    rev_growth = round(r.uniform(-0.05, 0.40), 4)
    de_ratio = round(r.uniform(0.1, 2.5), 2)
    target_mean = round(price * r.uniform(0.9, 1.3), 2)

    recs = ["strongBuy", "buy", "hold", "underperform"]
    rec = r.choice(recs)

    return {
        "symbol": symbol,
        "name": f"{symbol} Corporation",
        "sector": "Technology",
        "industry": "Diversified",
        "country": "US",
        "exchange": "NASDAQ",
        "currency": "USD",
        "website": f"https://{symbol.lower()}.com",
        "description": f"{symbol} is a publicly listed company. Mock data for offline development.",

        # Valuation
        "market_cap": mcap,
        "enterprise_value": round(mcap * r.uniform(0.9, 1.2)),
        "pe_trailing": pe,
        "pe_forward": round(pe * r.uniform(0.75, 0.95), 2) if pe else None,
        "peg_ratio": round(r.uniform(0.5, 3.0), 2),
        "price_to_book": round(price / bv, 2) if bv > 0 else None,
        "price_to_sales": round(mcap / revenue, 2) if revenue > 0 else None,
        "ev_to_revenue": round(mcap * 1.05 / revenue, 2) if revenue > 0 else None,
        "ev_to_ebitda": round(r.uniform(8, 30), 2),

        # Financials
        "revenue": revenue,
        "revenue_per_share": round(revenue / shares, 2) if shares > 0 else None,
        "revenue_growth": rev_growth,
        "earnings_growth": round(r.uniform(-0.10, 0.50), 4),
        "gross_margins": gross_margin,
        "ebitda_margins": round(gross_margin * r.uniform(0.4, 0.7), 4),
        "operating_margins": round(gross_margin * r.uniform(0.3, 0.6), 4),
        "profit_margins": profit_margin,

        # Per share
        "eps_trailing": eps,
        "eps_forward": round(eps * r.uniform(1.0, 1.15), 2),
        "book_value": bv,

        # Balance sheet
        "total_cash": round(r.uniform(5e9, 80e9)),
        "total_debt": round(r.uniform(2e9, 60e9)),
        "debt_to_equity": de_ratio,
        "current_ratio": round(r.uniform(1.0, 3.5), 2),
        "quick_ratio": round(r.uniform(0.8, 2.5), 2),

        # Dividends
        "dividend_yield": div_yield,
        "dividend_rate": round(div_yield * price, 2) if div_yield else None,
        "payout_ratio": round(r.uniform(0.15, 0.60), 4) if div_yield else None,
        "ex_dividend_date": "",

        # Targets & Recommendations
        "target_high": round(target_mean * r.uniform(1.1, 1.4), 2),
        "target_low": round(target_mean * r.uniform(0.6, 0.9), 2),
        "target_mean": target_mean,
        "target_median": round(target_mean * r.uniform(0.97, 1.03), 2),
        "recommendation": rec,
        "num_analysts": int(r.uniform(8, 40)),

        # Trading info
        "beta": beta,
        "fifty_two_week_high": round(price * r.uniform(1.05, 1.40), 2),
        "fifty_two_week_low": round(price * r.uniform(0.55, 0.85), 2),
        "fifty_day_avg": round(price * r.uniform(