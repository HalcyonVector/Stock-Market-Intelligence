"""Insider transactions — Finnhub free tier supports this endpoint."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.adapters.mock import _UNIVERSE, _seed
from app.core.config import settings
from app.core.logging import get_logger
from app.core import snapshot

log = get_logger("services.insider")

BASE = "https://finnhub.io/api/v1"
INSIDER_TTL = 3600  # cache 1 hour


_TXCODE_LABELS = {
    "P": "Purchase", "S": "Sale", "A": "Grant", "D": "Disposition",
    "G": "Gift", "M": "Exercise", "F": "Tax Withhold", "C": "Conversion",
    "X": "Exercise", "J": "Other", "W": "Will/Inheritance",
}


async def _fetch_finnhub(symbol: str) -> list[dict]:
    """Fetch insider transactions from Finnhub for one symbol."""
    if not settings.FINNHUB_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{BASE}/stock/insider-transactions",
                params={"symbol": symbol},
                headers={"X-Finnhub-Token": settings.FINNHUB_API_KEY},
            )
            r.raise_for_status()
            data = r.json()

        txns = data.get("data", [])
        out = []
        seen_names: set[str] = set()
        for t in txns:
            if len(out) >= 2:
                break
            name = t.get("name", "Unknown")
            # Deduplicate: 1 entry per person per symbol
            if name in seen_names:
                continue
            seen_names.add(name)

            change = t.get("change", 0) or 0
            code = t.get("transactionCode", "")
            title = _TXCODE_LABELS.get(code, "Insider")

            out.append({
                "symbol": symbol,
                "name": name,
                "title": title,
                "transaction_type": "Buy" if change > 0 else "Sell",
                "shares": abs(int(change)),
                "value": abs(float(t.get("transactionPrice", 0) or 0) * abs(int(change))),
                "date": t.get("transactionDate", t.get("filingDate", "")),
            })
        return out
    except Exception as e:
        log.warning("insider.finnhub.error", symbol=symbol, error=str(e))
        return []


def _mock_insider(symbol: str) -> list[dict]:
    """Generate deterministic mock insider data."""
    r = _seed(symbol + "insider")
    roles = ["CEO", "CFO", "COO", "Director", "VP Engineering", "SVP Sales", "Board Member"]
    names = ["J. Smith", "M. Patel", "R. Chen", "K. Williams", "S. Kumar", "A. Johnson", "L. Garcia"]
    txn_type = r.choice(["Buy", "Sell"])
    shares = r.randint(1000, 50000)
    price = 20 + r.random() * 300
    return [{
        "symbol": symbol,
        "name": r.choice(names),
        "title": r.choice(roles),
        "transaction_type": txn_type,
        "shares": shares,
        "value": round(shares * price, 2),
        "date": f"2026-06-{r.randint(10, 24):02d}",
    }]


def _insider_key(market: str) -> str:
    return f"insider:{market}"


async def compute_insider_activity(market: str = "GLOBAL", limit: int = 15) -> list[dict]:
    """Heavy universe scan against Finnhub. Runs in the background (startup
    warm, keep-alive refresh) -- never on the request path, since up to 20
    sequential-ish Finnhub calls can take tens of seconds under rate limiting."""
    syms = _UNIVERSE.get(market, _UNIVERSE["GLOBAL"])
    # Pick a subset to avoid hammering the API
    sample = syms[:20]

    if settings.FINNHUB_API_KEY:
        sem = asyncio.Semaphore(3)

        async def _fetch(s: str) -> list[dict]:
            async with sem:
                result = await _fetch_finnhub(s)
                await asyncio.sleep(0.1)  # rate limit courtesy
                return result

        results = await asyncio.gather(*(_fetch(s) for s in sample))
        all_txns = [t for batch in results for t in batch]
    else:
        all_txns = []

    # Fill with mock if not enough real data
    if len(all_txns) < limit:
        for s in syms:
            if len(all_txns) >= limit:
                break
            existing = {t["symbol"] for t in all_txns}
            if s not in existing:
                all_txns.extend(_mock_insider(s))

    # Sort by date descending, take limit
    all_txns.sort(key=lambda x: x.get("date", ""), reverse=True)
    return all_txns[:limit]


async def get_insider_activity(market: str = "GLOBAL", limit: int = 15) -> list[dict]:
    """API-facing. Serves the last durable snapshot instantly and refreshes in
    the background when stale -- so a cold/expired cache never blocks the
    request on a full Finnhub universe scan."""
    data = await snapshot.serve(
        _insider_key(market),
        lambda: compute_insider_activity(market, limit),
        max_age=INSIDER_TTL,
        empty=[],
    )
    return data[:limit]
