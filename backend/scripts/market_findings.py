"""
Recompute the README's Findings from public data.

    cd backend && python -m scripts.market_findings [--period 1y] [--json]

Downloads adjusted daily closes for the tracked universe (97 US, 63 NSE) and
the two benchmarks with yfinance, then reports per market: median 1-year
return, share of stocks that rose, median annualised volatility, median
maximum drawdown, average pairwise correlation of daily returns, and the
same-day US vs India correlation. Also prints FD vs PPF real returns and
Direct vs Regular plan returns for a few mutual funds (AMFI NAVs, mfapi.in).

Needs network access; uses no API keys and writes nothing.
"""
from __future__ import annotations

import argparse
import asyncio
import json

import numpy as np
import pandas as pd
import yfinance as yf

from app.adapters.mock import _UNIVERSE
from app.services import mutual_funds as mf

FUNDS = ["parag parikh flexi cap fund", "hdfc flexi cap fund", "uti nifty next 50 index fund"]


def load_closes(period: str) -> pd.DataFrame:
    us = sorted(set(_UNIVERSE["US"]))
    india = sorted(s for s in set(_UNIVERSE["IN"]) if s not in _UNIVERSE["US"])
    tickers = {s: s for s in us} | {s: f"{s}.NS" for s in india} | {"SPY": "SPY", "^NSEI": "^NSEI"}
    raw = yf.download(list(tickers.values()), period=period, interval="1d", auto_adjust=True,
                      progress=False, threads=True, group_by="ticker")
    have = set(raw.columns.get_level_values(0))
    close = pd.DataFrame({s: raw[t]["Close"] for s, t in tickers.items() if t in have})
    # Keep symbols with at least ~80% of the window (drops recent listings).
    return close.dropna(axis=1, thresh=int(len(close) * 0.8))


def market_stats(close: pd.DataFrame, rets: pd.DataFrame, cols: list[str]) -> dict:
    c = [x for x in cols if x in close.columns]
    px = close[c].ffill()
    total = px.iloc[-1] / px.bfill().iloc[0] - 1
    vol = rets[c].std() * np.sqrt(252)
    drawdown = (px / px.cummax() - 1).min()
    corr = rets[c].corr().values
    upper = corr[np.triu_indices_from(corr, 1)]
    return {
        "stocks": len(c),
        "median_return_pct": round(float(total.median() * 100), 1),
        "share_rose_pct": round(float((total > 0).mean() * 100), 1),
        "median_volatility_pct": round(float(vol.median() * 100), 1),
        "median_max_drawdown_pct": round(float(drawdown.median() * 100), 1),
        "avg_pairwise_correlation": round(float(np.nanmean(upper)), 2),
    }


def real_return(nominal: float, tax: float, inflation: float) -> float:
    return round(((1 + nominal * (1 - tax)) / (1 + inflation) - 1) * 100, 2)


async def fund_gaps() -> list[dict]:
    out = []
    for q in FUNDS:
        hits = await mf.search(q)

        def pick(plan: str):
            return next((h for h in hits if plan in h["name"].lower() and "growth" in h["name"].lower()
                         and "idcw" not in h["name"].lower()), None)

        d, r = pick("direct"), pick("regular")
        if not d or not r:
            continue
        ds, rs = await mf.scheme(d["code"]), await mf.scheme(r["code"])
        if ds and rs:
            out.append({"fund": ds["name"].split(" - Direct")[0].replace(" - ", " "), "direct": ds["returns"], "regular": rs["returns"]})
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--period", default="1y", help="yfinance period, e.g. 6mo, 1y, 2y")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a summary")
    args = ap.parse_args()

    close = load_closes(args.period)
    rets = close.pct_change(fill_method=None)
    us = [s for s in _UNIVERSE["US"] if s in close.columns]
    india = [s for s in _UNIVERSE["IN"] if s not in _UNIVERSE["US"] and s in close.columns]
    cross = rets[us + india].corr().loc[us, india].values

    report = {
        "window": [str(close.index[0].date()), str(close.index[-1].date()), len(close)],
        "US": market_stats(close, rets, us),
        "IN": market_stats(close, rets, india),
        "same_day_us_india_correlation": round(float(np.nanmean(cross)), 2),
        "benchmarks_pct": {b: round(float((close[b].dropna().iloc[-1] / close[b].dropna().iloc[0] - 1) * 100), 1)
                           for b in ("SPY", "^NSEI") if b in close.columns},
        "real_returns_pct": {"FD 7% at 30% slab": real_return(0.07, 0.30, 0.05),
                             "PPF 7.1% tax-free": real_return(0.071, 0.0, 0.05)},
        "direct_vs_regular": asyncio.run(fund_gaps()),
    }
    if args.json:
        print(json.dumps(report, indent=2))
        return
    w = report["window"]
    print(f"Window: {w[0]} to {w[1]} ({w[2]} trading days)\n")
    for m in ("US", "IN"):
        s = report[m]
        print(f"{m}: {s['stocks']} stocks, median return {s['median_return_pct']}%, "
              f"{s['share_rose_pct']}% rose, median vol {s['median_volatility_pct']}%, "
              f"median max drawdown {s['median_max_drawdown_pct']}%, avg correlation {s['avg_pairwise_correlation']}")
    print(f"Same-day US vs India correlation: {report['same_day_us_india_correlation']}")
    print(f"Benchmarks: {report['benchmarks_pct']}")
    print(f"Real returns (5% inflation): {report['real_returns_pct']}")
    for f in report["direct_vs_regular"]:
        print(f"{f['fund']}: 5y Direct {f['direct']['5y']}% vs Regular {f['regular']['5y']}% a year")


if __name__ == "__main__":
    main()
