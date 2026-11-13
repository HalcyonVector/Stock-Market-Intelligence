"""
Value a list of holdings imported from a broker CSV (Zerodha, Groww, Upstox,
or any file with symbol / quantity / average-cost columns).

The CSV itself is parsed in the browser and never uploaded; only symbols,
quantities and average costs arrive here, and nothing is stored. Prices come
from the normal quote chain (one batched call), so this costs the same free
quota as opening a watchlist.
"""
from __future__ import annotations

import re

from app.adapters.history_store import is_indian
from app.adapters.registry import providers
from app.services.symbols import in_universe, is_valid, register_extra

MAX_HOLDINGS = 60
_PREFIXES = re.compile(r"^(NSE|BSE|NASDAQ|NYSE)[:\s]+")
_SUFFIXES = re.compile(r"-(EQ|BE|BZ|SM|ST)$")


def normalize(symbol: str, market: str) -> str | None:
    """Broker-style ticker -> the app's symbol. Indian brokers export bare NSE
    symbols (RELIANCE, M&M) or ones with a series suffix (IDEA-EQ)."""
    s = _PREFIXES.sub("", symbol.strip().upper())
    s = _SUFFIXES.sub("", s).replace(" ", "")
    if not s:
        return None
    if market == "IN" and not s.endswith((".NS", ".BO")) and not in_universe(s):
        s = f"{s}.NS"
    return s if is_valid(s) else None


async def value(holdings: list[dict], market: str) -> dict:
    rows, skipped = [], []
    merged: dict[str, dict] = {}
    for h in holdings[:MAX_HOLDINGS]:
        sym = normalize(str(h.get("symbol", "")), market)
        qty = float(h.get("quantity") or 0)
        if not sym or qty <= 0:
            skipped.append(str(h.get("symbol", ""))[:20])
            continue
        cost = float(h.get("avg_cost") or 0)
        m = merged.setdefault(sym, {"symbol": sym, "quantity": 0.0, "cost": 0.0})
        m["quantity"] += qty
        m["cost"] += cost * qty

    quotes = {}
    if merged:
        for q in await providers.market.quotes(sorted(merged)):
            quotes[q.symbol.upper()] = q

    totals: dict[str, dict] = {}
    for sym, m in sorted(merged.items()):
        q = quotes.get(sym)
        cur = "INR" if is_indian(sym) else "USD"
        sample = q is not None and getattr(q, "source", "live") == "mock"
        price = q.price if q and q.price and not sample else None
        value_now = price * m["quantity"] if price else None
        avg = m["cost"] / m["quantity"] if m["quantity"] else 0
        rows.append({
            "symbol": sym, "currency": cur, "quantity": round(m["quantity"], 4),
            "avg_cost": round(avg, 4), "price": price,
            "price_source": q.source if q and price else None,
            "value": round(value_now, 2) if value_now is not None else None,
            "invested": round(m["cost"], 2),
            "pnl": round(value_now - m["cost"], 2) if value_now is not None and m["cost"] else None,
            "pnl_pct": round((value_now - m["cost"]) / m["cost"] * 100, 2) if value_now is not None and m["cost"] else None,
            "day_change_pct": q.change_pct if price else None,
        })
        t = totals.setdefault(cur, {"value": 0.0, "invested": 0.0, "priced": 0, "unpriced": 0})
        if value_now is not None:
            t["value"] += value_now
            t["invested"] += m["cost"]
            t["priced"] += 1
        else:
            t["unpriced"] += 1
        if price is None:
            await register_extra(sym)  # gets a price after the next daily sync

    for t in totals.values():
        t["value"] = round(t["value"], 2)
        t["invested"] = round(t["invested"], 2)
        t["pnl_pct"] = round((t["value"] - t["invested"]) / t["invested"] * 100, 2) if t["invested"] else None
    for r in rows:
        v, t = r["value"], totals[r["currency"]]
        r["weight_pct"] = round(v / t["value"] * 100, 2) if v and t["value"] else None
    return {"rows": rows, "totals": totals, "skipped": skipped}
