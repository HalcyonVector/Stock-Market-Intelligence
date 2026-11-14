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


def per_stock(close: pd.DataFrame, rets: pd.DataFrame, symbols: list[str], market: str) -> list[dict]:
    from app.services.heatmap import SECTOR_MAP

    rows = []
    for sym in symbols:
        px = close[sym].dropna()
        if len(px) < 30:
            continue
        r = rets[sym].dropna()
        rows.append({
            "symbol": sym, "market": market, "sector": SECTOR_MAP.get(sym, "Other"),
            "return_pct": round(float((px.iloc[-1] / px.iloc[0] - 1) * 100), 1),
            "volatility_pct": round(float(r.std() * np.sqrt(252) * 100), 1),
            "max_drawdown_pct": round(float((px / px.cummax() - 1).min() * 100), 1),
        })
    return rows


def global_cues(rets: pd.DataFrame, us: list[str], india: list[str]) -> dict:
    """Does the US move predict India's next session? Compare same-day and
    next-day correlation of equal-weighted daily returns."""
    us_ret = rets[us].mean(axis=1, skipna=True)
    in_ret = rets[india].mean(axis=1, skipna=True)
    us_days = us_ret[rets[us].notna().sum(axis=1) > len(us) * 0.5]
    in_days = in_ret[rets[india].notna().sum(axis=1) > len(india) * 0.5]
    same = pd.concat([us_days, in_days], axis=1, join="inner").dropna()
    # Pair each US session with the next Indian session after it.
    in_dates = in_days.index
    pairs = []
    for d, v in us_days.items():
        nxt = in_dates[in_dates > d]
        if len(nxt):
            pairs.append((v, in_days[nxt[0]]))
    nxt_df = pd.DataFrame(pairs, columns=["us", "in_next"]).dropna()
    big = nxt_df[nxt_df["us"].abs() >= nxt_df["us"].abs().quantile(0.8)]
    agree = float((np.sign(big["us"]) == np.sign(big["in_next"])).mean() * 100) if len(big) else None
    return {
        "same_day_corr": round(float(same.iloc[:, 0].corr(same.iloc[:, 1])), 2) if len(same) > 20 else None,
        "next_day_corr": round(float(nxt_df["us"].corr(nxt_df["in_next"])), 2) if len(nxt_df) > 20 else None,
        "big_us_days": int(len(big)),
        "big_day_same_direction_pct": round(agree, 1) if agree is not None else None,
    }


def index_cues(close: pd.DataFrame) -> dict | None:
    """S&P 500 (SPY) session vs the Nifty 50's next session: what the daily
    Global Cues card compares last night's US move against."""
    if "SPY" not in close.columns or "^NSEI" not in close.columns:
        return None
    spy = close["SPY"].dropna().pct_change().dropna() * 100
    nifty = close["^NSEI"].dropna().pct_change().dropna() * 100
    pairs = []
    for d, v in spy.items():
        nxt = nifty.index[nifty.index > d]
        if len(nxt):
            pairs.append((v, nifty[nxt[0]]))
    df = pd.DataFrame(pairs, columns=["spy", "nifty_next"])
    if len(df) < 30:
        return None
    threshold = float(df["spy"].abs().quantile(0.8))
    big = df[df["spy"].abs() >= threshold]
    same = lambda x: float((np.sign(x["spy"]) == np.sign(x["nifty_next"])).mean() * 100)
    up, down = big[big["spy"] > 0], big[big["spy"] < 0]
    return {
        "next_day_corr": round(float(df["spy"].corr(df["nifty_next"])), 2),
        "big_move_threshold_pct": round(threshold, 2),
        "all_days_same_direction_pct": round(same(df), 1),
        "big_days": int(len(big)),
        "big_days_same_direction_pct": round(same(big), 1),
        "after_big_up_avg_nifty_pct": round(float(up["nifty_next"].mean()), 2) if len(up) else None,
        "after_big_down_avg_nifty_pct": round(float(down["nifty_next"].mean()), 2) if len(down) else None,
        "sessions": int(len(df)),
    }


def build_report(period: str = "1y", with_stocks: bool = False) -> dict:
    close = load_closes(period)
    rets = close.pct_change(fill_method=None)
    us = [s for s in _UNIVERSE["US"] if s in close.columns]
    india = [s for s in _UNIVERSE["IN"] if s not in _UNIVERSE["US"] and s in close.columns]
    cross = rets[us + india].corr().loc[us, india].values
    report = {
        "window": [str(close.index[0].date()), str(close.index[-1].date()), len(close)],
        "US": market_stats(close, rets, us),
        "IN": market_stats(close, rets, india),
        "same_day_us_india_correlation": round(float(np.nanmean(cross)), 2),
        "global_cues": global_cues(rets, us, india),
        "index_cues": index_cues(close),
        "benchmarks_pct": {b: round(float((close[b].dropna().iloc[-1] / close[b].dropna().iloc[0] - 1) * 100), 1)
                           for b in ("SPY", "^NSEI") if b in close.columns},
        "real_returns_pct": {"FD 7% at 30% slab": real_return(0.07, 0.30, 0.05),
                             "PPF 7.1% tax-free": real_return(0.071, 0.0, 0.05)},
        "direct_vs_regular": asyncio.run(fund_gaps()),
    }
    if with_stocks:
        report["stocks"] = per_stock(close, rets, us, "US") + per_stock(close, rets, india, "IN")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--period", default="1y", help="yfinance period, e.g. 6mo, 1y, 2y")
    ap.add_argument("--json", action="store_true", help="print JSON instead of a summary")
    ap.add_argument("--store", action="store_true",
                    help="write the full report (with per-stock rows) to Redis for the Market Study page")
    args = ap.parse_args()

    report = build_report(args.period, with_stocks=args.store or args.json)
    if args.store:
        import os
        from datetime import datetime, timezone

        import redis

        report["generated_at"] = datetime.now(timezone.utc).isoformat()
        r = redis.Redis.from_url(os.environ["REDIS_URL"], socket_timeout=20)
        r.set("study:v1", json.dumps(report, separators=(",", ":")))
        print(f"stored study:v1 ({len(report['stocks'])} stocks)")
    if args.json:
        print(json.dumps(report, indent=2))
        return
    w = report["window"]
    print(f"Window: {w[0]} to {w[1]} ({w[2]} trading days)\n")
    for m in ("US", "IN"):
        st = report[m]
        print(f"{m}: {st['stocks']} stocks, median return {st['median_return_pct']}%, "
              f"{st['share_rose_pct']}% rose, median vol {st['median_volatility_pct']}%, "
              f"median max drawdown {st['median_max_drawdown_pct']}%, avg correlation {st['avg_pairwise_correlation']}")
    gc = report["global_cues"]
    print(f"US vs India correlation: same day {gc['same_day_corr']}, US day vs next Indian session {gc['next_day_corr']}; "
          f"on the {gc['big_us_days']} biggest US days India moved the same way next session "
          f"{gc['big_day_same_direction_pct']}% of the time")
    print(f"Benchmarks: {report['benchmarks_pct']}")
    print(f"Real returns (5% inflation): {report['real_returns_pct']}")
    for f in report["direct_vs_regular"]:
        print(f"{f['fund']}: 5y Direct {f['direct']['5y']}% vs Regular {f['regular']['5y']}% a year")


if __name__ == "__main__":
    main()
