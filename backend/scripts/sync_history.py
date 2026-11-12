"""
Fetch ~400 days of daily bars for every tracked stock (US + NSE) with yfinance
and store them in Redis for the API to serve (see app/adapters/history_store.py).

Runs once a day from GitHub Actions (.github/workflows/sync-history.yml):
Yahoo blocks Render's IPs, but this job runs elsewhere and only needs Redis.

    cd backend && REDIS_URL=rediss://... python -m scripts.sync_history

Besides the scan universe it fetches:
  * benchmarks (S&P 500 ETF, Nifty 50) for the paper-trading comparison chart;
  * "extra" symbols users added to a watchlist/alert/paper trade (Redis set
    hist:extra, capped at 300 by the API). An extra that fails 3 runs in a row
    is dropped, so typos and delisted tickers don't linger.

Free-tier cost: one SET per symbol per run (~2 runs/day).
Exits non-zero if most universe symbols fail, so a broken run shows up red.
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
EXTRA_KEY = "hist:extra"
EXTRA_FAILS_KEY = "hist:extra:fails"
EXTRA_MAX_FAILS = 3
# Stored under these exact keys (hist:1d:SPY, hist:1d:^NSEI).
BENCHMARKS = ["SPY", "^NSEI"]


def universe() -> list[str]:
    syms: set[str] = set()
    for lst in _UNIVERSE.values():
        syms.update(lst)
    return sorted(syms)


def yahoo_symbol(sym: str) -> str:
    # Extras keep their suffix (IRCTC.NS); tracked NSE symbols don't have one.
    indian = sym in _UNIVERSE.get("IN", []) and sym not in _UNIVERSE.get("US", [])
    return f"{sym}.NS" if indian and not sym.endswith(".NS") else sym


def extras(r) -> list[str]:
    try:
        raw = r.smembers(EXTRA_KEY)
    except Exception as e:  # noqa: BLE001
        print(f"could not read {EXTRA_KEY}: {e}", file=sys.stderr)
        return []
    out = {(s.decode() if isinstance(s, bytes) else s).upper() for s in raw}
    return sorted(out - set(universe()))


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
    # SYNC_MARKET=IN: the midday run, NSE stocks only (a delayed intraday price
    # for stocks that have no free live quote source).
    only_in = os.environ.get("SYNC_MARKET", "ALL").upper() == "IN"
    url = os.environ.get("REDIS_URL")
    if not url:
        print("REDIS_URL is not set", file=sys.stderr)
        return 2
    r = redis.Redis.from_url(url, socket_timeout=20, socket_connect_timeout=20)

    core = universe()
    extra = extras(r)
    benchmarks = BENCHMARKS
    if only_in:
        core = [s for s in core if yahoo_symbol(s).endswith(".NS")]
        extra = [s for s in extra if s.endswith((".NS", ".BO"))]
        benchmarks = ["^NSEI"]
    syms = core + benchmarks + extra
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

    # Extras that keep failing are probably typos or delisted: drop them.
    if extra:
        failed_set = set(failed)
        prev = {(k.decode() if isinstance(k, bytes) else k): int(v)
                for k, v in r.hgetall(EXTRA_FAILS_KEY).items()}
        now_failing = {s: prev.get(s, 0) + 1 for s in extra if s in failed_set}
        recovered = [s for s in extra if s in prev and s not in failed_set]
        if now_failing:
            r.hset(EXTRA_FAILS_KEY, mapping=now_failing)
        if recovered:
            r.hdel(EXTRA_FAILS_KEY, *recovered)
        dead = [s for s, n in now_failing.items() if n >= EXTRA_MAX_FAILS]
        if dead:
            r.srem(EXTRA_KEY, *dead)
            r.hdel(EXTRA_FAILS_KEY, *dead)
            print(f"dropped extras after {EXTRA_MAX_FAILS} failed runs: {', '.join(dead)}")

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"{stamp} synced {ok}/{len(syms)} symbols ({len(core)} tracked, {len(extra)} extra)")
    if failed:
        print(f"missing: {', '.join(failed)}")
    core_ok = len(set(core) - set(failed))
    return 0 if core_ok >= len(core) * 0.5 else 1


if __name__ == "__main__":
    sys.exit(main())
