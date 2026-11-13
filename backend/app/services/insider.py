"""
Insider transactions (SEC Form 4) for tracked US stocks, from Finnhub's free
insider-transactions endpoint.

Only real filings are shown. If there are few recent ones, the card simply
shows fewer rows; nothing is invented to fill it. (Sample rows are used only
in DATA_MODE=mock, where every number on the site is sample data.)

Each filing is classified by its SEC transaction code: P (open-market
purchase) and S (open-market sale) are the signals people care about; grants,
option exercises and tax withholding are automatic and are labelled as such
rather than counted as buys or sells.

Free-tier budget: one Finnhub call per symbol per refresh, refreshed at most
hourly in the background, over US symbols only (Form 4 is a US filing).
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

import httpx

from app.adapters.mock import _UNIVERSE, _seed
from app.core import snapshot
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("services.insider")

BASE = "https://finnhub.io/api/v1"
INSIDER_TTL = 3600
LOOKBACK_DAYS = 90
SYMBOLS_PER_SCAN = 40

# SEC Form 4 transaction codes.
_CODES = {
    "P": ("Buy", "Open-market purchase"),
    "S": ("Sell", "Open-market sale"),
    "A": ("Grant", "Award / grant"),
    "M": ("Exercise", "Option exercise"),
    "X": ("Exercise", "Option exercise"),
    "F": ("Tax", "Shares withheld for tax"),
    "G": ("Gift", "Gift"),
    "D": ("Disposition", "Disposition to issuer"),
    "C": ("Conversion", "Conversion"),
    "J": ("Other", "Other"),
    "W": ("Other", "Will or inheritance"),
}


def classify(t: dict) -> dict | None:
    """One Finnhub insider row -> the card's shape, or None to drop it."""
    code = (t.get("transactionCode") or "").upper()
    if code not in _CODES:
        return None
    kind, label = _CODES[code]
    change = int(t.get("change") or 0)
    if change == 0:
        return None
    price = float(t.get("transactionPrice") or 0)
    shares = abs(change)
    return {
        "symbol": t.get("symbol", ""),
        "name": (t.get("name") or "Unknown insider").title(),
        "kind": kind,                      # Buy | Sell | Grant | Exercise | Tax | ...
        "label": label,
        "code": code,
        # Kept for older clients: only real open-market trades are Buy/Sell.
        "transaction_type": kind if kind in ("Buy", "Sell") else "Other",
        "shares": shares,
        "price": price or None,
        "value": round(shares * price, 2) if price else None,
        "date": t.get("transactionDate") or t.get("filingDate") or "",
        "filing_date": t.get("filingDate") or "",
    }


async def _fetch_finnhub(client: httpx.AsyncClient, symbol: str, since: date) -> list[dict]:
    try:
        r = await client.get(
            f"{BASE}/stock/insider-transactions",
            params={"symbol": symbol, "from": since.isoformat()},
            headers={"X-Finnhub-Token": settings.FINNHUB_API_KEY},
        )
        r.raise_for_status()
        rows = r.json().get("data") or []
    except Exception as e:  # noqa: BLE001
        log.warning("insider.finnhub.error", symbol=symbol, error=str(e)[:160])
        return []
    out = []
    for t in rows:
        t.setdefault("symbol", symbol)
        c = classify(t)
        if c and c["date"] >= since.isoformat():
            out.append(c)
    return out


def rank(txns: list[dict], limit: int) -> list[dict]:
    """Open-market buys and sells first (the informative ones), newest first,
    at most two rows per symbol so one busy filer can't fill the card."""
    informative = [t for t in txns if t["kind"] in ("Buy", "Sell")]
    other = [t for t in txns if t["kind"] not in ("Buy", "Sell")]
    out, per_symbol = [], {}
    for group in (informative, other):
        for t in sorted(group, key=lambda x: (x["date"], x.get("value") or 0), reverse=True):
            n = per_symbol.get(t["symbol"], 0)
            if n >= 2:
                continue
            per_symbol[t["symbol"]] = n + 1
            out.append(t)
            if len(out) >= limit:
                return out
    return out


def _mock_rows(limit: int) -> list[dict]:
    """Sample rows for DATA_MODE=mock only."""
    rows = []
    for s in _UNIVERSE["US"][:limit]:
        r = _seed(s + "insider")
        buy = r.random() < 0.3
        shares = r.randint(1000, 50000)
        price = round(20 + r.random() * 300, 2)
        rows.append({
            "symbol": s, "name": "Sample Insider", "kind": "Buy" if buy else "Sell",
            "label": "Open-market purchase" if buy else "Open-market sale", "code": "P" if buy else "S",
            "transaction_type": "Buy" if buy else "Sell", "shares": shares, "price": price,
            "value": round(shares * price, 2),
            "date": (date.today() - timedelta(days=r.randint(1, 30))).isoformat(), "filing_date": "",
            "sample": True,
        })
    return rows


def _insider_key(market: str) -> str:
    return f"insider:v2:{market}"


async def compute_insider_activity(market: str = "GLOBAL", limit: int = 15) -> list[dict]:
    """Background scan (startup warm / keep-alive), never on the request path."""
    if settings.DATA_MODE == "mock":
        return _mock_rows(limit)
    if not settings.FINNHUB_API_KEY or market == "IN":
        return []  # Form 4 covers US listings only
    us = [s for s in _UNIVERSE["US"]]
    # Rotate through the US list so every stock gets checked over a few hours
    # without spending more than SYMBOLS_PER_SCAN calls per refresh.
    hour = datetime.now(timezone.utc).hour
    start = (hour * SYMBOLS_PER_SCAN) % max(1, len(us))
    sample = (us[start:] + us[:start])[:SYMBOLS_PER_SCAN]
    since = date.today() - timedelta(days=LOOKBACK_DAYS)
    sem = asyncio.Semaphore(3)

    async with httpx.AsyncClient(timeout=10) as client:
        async def one(s: str) -> list[dict]:
            async with sem:
                rows = await _fetch_finnhub(client, s, since)
                await asyncio.sleep(0.15)  # stay well under 60 calls/min
                return rows
        batches = await asyncio.gather(*(one(s) for s in sample))

    fresh = [t for b in batches for t in b]
    # Merge with the previous snapshot so symbols checked in earlier
    # rotations stay listed until they age out of the lookback window.
    try:
        hit = await snapshot.read(_insider_key(market))
        previous = hit[0] if hit else []
    except Exception:  # noqa: BLE001
        previous = []
    checked = set(sample)
    cutoff = since.isoformat()
    kept = [t for t in previous if t.get("symbol") not in checked and t.get("date", "") >= cutoff
            and not t.get("sample")]
    return rank(fresh + kept, max(limit, 30))


async def get_insider_activity(market: str = "GLOBAL", limit: int = 15) -> list[dict]:
    """Serves the last snapshot instantly; refreshes in the background when stale."""
    data = await snapshot.serve(
        _insider_key(market),
        lambda: compute_insider_activity(market, max(limit, 30)),
        max_age=INSIDER_TTL,
        empty=[],
    )
    return data[:limit]
