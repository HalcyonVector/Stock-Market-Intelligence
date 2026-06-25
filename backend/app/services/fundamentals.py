"""
Fundamental data extraction via yfinance.

P/E, EPS, revenue, margins, debt/equity, dividend yield, book value, etc.
Falls back gracefully when data is unavailable.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.core.redis import get_redis

CACHE_TTL = 1800  # 30 minutes


def _safe(info: dict, key: str, default=None):
    v = info.get(key, default)
    return v if v is not None else default


async def get_fundamentals(symbol: str) -> dict:
    cache_key = f"fundamentals:{symbol}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
    except Exception:
        return {"symbol": symbol, "error": "Failed to fetch fundamentals"}

    result = {
        "symbol": symbol,
        "name": _safe(info, "longName", _safe(info, "shortName", symbol)),
        "sector": _safe(info, "sector", "—"),
        "industry": _safe(info, "industry", "—"),
        "country": _safe(info, "country", "—"),
        "exchange": _safe(info, "exchange", "—"),
        "currency": _safe(info, "currency", "USD"),
        "website": _safe(info, "website"),
        "description": _safe(info, "longBusinessSummary", ""),

        # Valuation
        "market_cap": _safe(info, "marketCap"),
        "enterprise_value": _safe(info, "enterpriseValue"),
        "pe_trailing": _safe(info, "trailingPE"),
        "pe_forward": _safe(info, "forwardPE"),
        "peg_ratio": _safe(info, "pegRatio"),
        "price_to_book": _safe(info, "priceToBook"),
        "price_to_sales": _safe(info, "priceToSalesTrailing12Months"),
        "ev_to_revenue": _safe(info, "enterpriseToRevenue"),
        "ev_to_ebitda": _safe(info, "enterpriseToEbitda"),

        # Financials
        "revenue": _safe(info, "totalRevenue"),
        "revenue_per_share": _safe(info, "revenuePerShare"),
        "revenue_growth": _safe(info, "revenueGrowth"),
        "earnings_growth": _safe(info, "earningsGrowth"),
        "gross_margins": _safe(info, "grossMargins"),
        "ebitda_margins": _safe(info, "ebitdaMargins"),
        "operating_margins": _safe(info, "operatingMargins"),
        "profit_margins": _safe(info, "profitMargins"),

        # Per share
        "eps_trailing": _safe(info, "trailingEps"),
        "eps_forward": _safe(info, "forwardEps"),
        "book_value": _safe(info, "bookValue"),

        # Balance sheet
        "total_cash": _safe(info, "totalCash"),
        "total_debt": _safe(info, "totalDebt"),
        "debt_to_equity": _safe(info, "debtToEquity"),
        "current_ratio": _safe(info, "currentRatio"),
        "quick_ratio": _safe(info, "quickRatio"),

        # Dividends
        "dividend_yield": _safe(info, "dividendYield"),
        "dividend_rate": _safe(info, "dividendRate"),
        "payout_ratio": _safe(info, "payoutRatio"),
        "ex_dividend_date": str(_safe(info, "exDividendDate", "")),

        # Targets & Recommendations
        "target_high": _safe(info, "targetHighPrice"),
        "target_low": _safe(info, "targetLowPrice"),
        "target_mean": _safe(info, "targetMeanPrice"),
        "target_median": _safe(info, "targetMedianPrice"),
        "recommendation": _safe(info, "recommendationKey"),
        "num_analysts": _safe(info, "numberOfAnalystOpinions"),

        # Trading info
        "beta": _safe(info, "beta"),
        "fifty_two_week_high": _safe(info, "fiftyTwoWeekHigh"),
        "fifty_two_week_low": _safe(info, "fiftyTwoWeekLow"),
        "fifty_day_avg": _safe(info, "fiftyDayAverage"),
        "two_hundred_day_avg": _safe(info, "twoHundredDayAverage"),
        "shares_outstanding": _safe(info, "sharesOutstanding"),
        "float_shares": _safe(info, "floatShares"),
        "short_ratio": _safe(info, "shortRatio"),
        "short_percent_of_float": _safe(info, "shortPercentOfFloat"),

        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
    except Exception:
        pass

    return result
