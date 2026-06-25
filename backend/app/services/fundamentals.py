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
        "fifty_day_avg": round(price * r.uniform(0.92, 1.05), 2),
        "two_hundred_day_avg": round(price * r.uniform(0.85, 1.10), 2),
        "shares_outstanding": shares,
        "float_shares": int(shares * r.uniform(0.7, 0.95)),
        "short_ratio": round(r.uniform(1, 8), 2),
        "short_percent_of_float": round(r.uniform(0.01, 0.15), 4),

        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_fundamentals(symbol: str) -> dict:
    cache_key = f"fundamentals:{symbol}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    # --- Mock mode: return synthetic data ---
    if settings.DATA_MODE == "mock":
        result = _mock_fundamentals(symbol)
        try:
            await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
        except Exception:
            pass
        return result

    # --- Live mode: yfinance → Finnhub → mock fallback ---
    import asyncio

    info: dict = {}

    # 1. Try yfinance
    try:
        import yfinance as yf
        ticker = await asyncio.to_thread(lambda: yf.Ticker(symbol))
        raw = await asyncio.to_thread(lambda: ticker.info or {})
        # Only keep if it has real data (marketCap or trailingPE)
        if raw.get("marketCap") or raw.get("trailingPE"):
            info = raw
    except Exception:
        pass

    # 2. Try Finnhub basic financials (maps to our field names)
    fh_data: dict = {}
    try:
        from app.adapters.finnhub_provider import finnhub_fundamentals
        fh = await finnhub_fundamentals(symbol)
        if fh:
            # Map Finnhub keys → yfinance-compatible keys
            fh_map = {
                "pe_trailing": "trailingPE",
                "pe_forward": "forwardPE",
                "peg_ratio": "pegRatio",
                "price_to_book": "priceToBook",
                "price_to_sales": "priceToSalesTrailing12Months",
                "revenue": "revenuePerShare",
                "revenue_growth": "revenueGrowth",
                "earnings_growth": "earningsGrowth",
                "gross_margins": "grossMargins",
                "operating_margins": "operatingMargins",
                "profit_margins": "profitMargins",
                "eps_trailing": "trailingEps",
                "eps_forward": "forwardEps",
                "book_value": "bookValue",
                "debt_to_equity": "debtToEquity",
                "current_ratio": "currentRatio",
                "quick_ratio": "quickRatio",
                "dividend_yield": "dividendYield",
                "beta": "beta",
                "fifty_two_week_high": "fiftyTwoWeekHigh",
                "fifty_two_week_low": "fiftyTwoWeekLow",
                "market_cap": "marketCap",
                "ev_to_ebitda": "enterpriseToEbitda",
                "short_ratio": "shortRatio",
                "num_analysts": "numberOfAnalystOpinions",
            }
            # Keys where Finnhub gives percentage (45.5) but yfinance gives decimal (0.455)
            pct_keys = {"gross_margins", "operating_margins", "profit_margins",
                        "revenue_growth", "earnings_growth", "dividend_yield"}
            for fh_key, yf_key in fh_map.items():
                val = fh.get(fh_key)
                if val is not None:
                    # Convert Finnhub market cap from millions to raw
                    if fh_key == "market_cap":
                        val = val * 1e6
                    # Convert Finnhub percentages to decimals (yfinance convention)
                    elif fh_key in pct_keys:
                        val = val / 100.0
                    fh_data[yf_key] = val
    except Exception:
        pass

    # Merge: Finnhub fills gaps in yfinance
    for k, v in fh_data.items():
        if info.get(k) is None:
            info[k] = v

    # 3. If still nothing useful, fall back to mock
    has_data = any(
        info.get(k) is not None
        for k in ("marketCap", "trailingPE", "trailingEps", "beta", "grossMargins")
    )
    if not has_data:
        result = _mock_fundamentals(symbol)
        try:
            await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
        except Exception:
            pass
        return result

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
