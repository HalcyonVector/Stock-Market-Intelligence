"""
Fetch ~400 days of daily bars for every tracked stock (US + NSE) with yfinance
and store them in Redis for the API to serve (see app/adapters/history_store.py).

Runs once a day from GitHub Actions (.github/workflows/sync-history.yml):
Yahoo blocks Render's IPs, but this job runs elsewhere and only needs Redis.

    cd backend && REDIS_URL=rediss://... python -m scripts.sync_history

Free-tier cost: one SET per symbol per day (~160 Upstash commands/day).
Exits non-zero if most symbols fail, so a broken run shows up red in Actions.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import redis
import yfinance as yf

from app.adapters import history_store
from app.adapters.base import Candle
from app.adapters.mock import _UNIVERSE

BATCH = 40
MIN_BARS = 30


def universe() -> list[str]:
    syms: set[str] = set()
    for lst in _UNIVERSE.values():
        syms.update(lst)
    return sorted(syms)


def yahoo_symbol(sym: str) -> str:
    indian = sym in _UNIVERSE.get("IN", []) and sym not in _UNIVERSE.get("US", [])
    return f"{sym}.NS" if indian and not sym.endswith(".NS") else sym


def fetch_batch(symbols: list[str]) -> dict[str, list[Candle]]:
    tickers = {yahoo_symbol(s): s for s in symbols}
    df = yf.download(
        list(tickers), period="400d", interval="1d", group_by="ticker",
        auto_adjust=False, progress=False, threads=True,
    )
    out: dict[str, list[Candle]] = {}
    for ysym, sym in tickers.items():
        try:
            sub = df[ysym] if len(tickers) > 1 else df
            sub = sub.dropna(subset=["Close"])
        except Exception:  # noqa: BLE001 -- missing ticker in the frame
            continue
        bars = [
            Candle(ts=ts.to_pydatetime().replace(tzinfo=timezone.utc),
                   open=float(r.Open), high=float(r.High), low=float(r.Low),
                   close=float(r.Close), volume=int(r.Volume or 0))
            for ts, r in sub.iterrows()
        ]
        if len(bars) >= MIN_BARS:
            out[sym] = bars
    return out


def main() -> int:
    url = os.environ.get("REDIS_URL")
    if not url:
        print("REDIS_URL is not set", file=sys.stderr)
        return 2
    r = redis.Redis.from_url(url, socket_timeout=20, socket_connect_timeout=20)

    syms = universe()
    ok, failed = 0, []
    for i in range(0, len(syms), BATCH):
        batch = syms[i:i + BATCH]
        try:
            got = fetch_batch(batch)
        except Exception as e:  # noqa: BLE001
            print(f"batch {i // BATCH} failed: {e}", file=sys.stderr)
            got = {}
        pipe = r.pipeline(transaction=False)
        for sym in batch:
            if sym in got:
                # Never overwrite good history with an empty/short fetch.
                pipe.set(history_store.KEY.format(symbol=sym), history_store.encode(got[sym]))
                ok += 1
            else:
                failed.append(sym)
        pipe.execute()

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"{stamp} synced {ok}/{len(syms)} symbols")
    if failed:
        print(f"missing: {', '.join(failed)}")
    return 0 if ok >= len(syms) * 0.5 else 1


if __name__ == "__main__":
    sys.exit(main())
