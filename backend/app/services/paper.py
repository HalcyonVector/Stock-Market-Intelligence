"""
Paper trading — practice buying and selling with virtual money.

Educational only: nothing here touches a broker. Each anonymous browser
identity gets one account with separate USD and INR cash (US and NSE stocks
are priced in their own currency, so no FX conversion is ever needed). Orders
fill instantly at the current (free-tier, ~15-min-delayed) quote.

Free-tier notes: the database is written only when a user places an order or
resets, and the trade log is capped per account, so Neon storage stays tiny
and the compute can scale to zero between visits.
"""
from __future__ import annotations

import re

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.adapters.registry import providers
from app.models.entities import PaperAccount, PaperPosition, PaperTrade

STARTING_CASH = {"USD": 100_000.0, "INR": 1_000_000.0}
MAX_TRADES_KEPT = 200
SYMBOL_RE = re.compile(r"^[A-Z0-9.^=&-]{1,20}$")


def currency_of(symbol: str) -> str:
    # Tracked NSE stocks have no suffix (RELIANCE), others do (IRCTC.NS).
    from app.adapters.history_store import is_indian

    return "INR" if is_indian(symbol) else "USD"


def _is_sample(q) -> bool:
    """Sample (mock) price served because every live source failed. In mock
    mode everything is sample data, so only refuse it when running live."""
    from app.core.config import settings

    return settings.DATA_MODE == "live" and getattr(q, "source", "live") == "mock"


def _cash_attr(currency: str) -> str:
    return "cash_inr" if currency == "INR" else "cash_usd"


async def _load(db: AsyncSession, user_id: str) -> PaperAccount | None:
    res = await db.execute(
        select(PaperAccount)
        .where(PaperAccount.user_id == user_id)
        .options(selectinload(PaperAccount.positions))
        .execution_options(populate_existing=True)
    )
    return res.scalar_one_or_none()


async def _get_or_create(db: AsyncSession, user_id: str) -> PaperAccount:
    acct = await _load(db, user_id)
    if acct is None:
        acct = PaperAccount(
            user_id=user_id, cash_usd=STARTING_CASH["USD"], cash_inr=STARTING_CASH["INR"],
        )
        db.add(acct)
        await db.flush()
        acct = await _load(db, user_id)
    return acct  # type: ignore[return-value]


async def _recent_trades(db: AsyncSession, account_id: int, limit: int = 50) -> list[PaperTrade]:
    res = await db.execute(
        select(PaperTrade).where(PaperTrade.account_id == account_id)
        .order_by(PaperTrade.id.desc()).limit(limit)
    )
    return list(res.scalars().all())


async def summary(db: AsyncSession, user_id: str) -> dict:
    """Account view with positions marked to the latest quotes.

    Read-only: a visitor who never trades gets the starting balances without
    any row being written.
    """
    acct = await _load(db, user_id)
    if acct is None:
        cash = dict(STARTING_CASH)
        positions: list[PaperPosition] = []
        trades: list[PaperTrade] = []
    else:
        cash = {"USD": acct.cash_usd, "INR": acct.cash_inr}
        positions = list(acct.positions)
        trades = await _recent_trades(db, acct.id)

    quotes = {}
    if positions:
        try:
            for q in await providers.market.quotes([p.symbol for p in positions]):
                quotes[q.symbol.upper()] = q
        except Exception:  # noqa: BLE001 -- show cost basis if quotes are unavailable
            quotes = {}

    rows = []
    totals = {c: {"cash": cash[c], "market_value": 0.0, "cost_basis": 0.0} for c in STARTING_CASH}
    for p in sorted(positions, key=lambda x: x.symbol):
        cur = currency_of(p.symbol)
        q = quotes.get(p.symbol.upper())
        if q is not None and (not q.price or _is_sample(q)):
            q = None  # never mark a position to sample data
        price = q.price if q else p.avg_cost
        mv = price * p.quantity
        cost = p.avg_cost * p.quantity
        totals[cur]["market_value"] += mv
        totals[cur]["cost_basis"] += cost
        rows.append({
            "symbol": p.symbol,
            "currency": cur,
            "quantity": round(p.quantity, 4),
            "avg_cost": round(p.avg_cost, 4),
            "price": round(price, 4),
            "price_is_live": q is not None,
            "price_source": q.source if q else "cost",
            "day_change_pct": q.change_pct if q else None,
            "market_value": round(mv, 2),
            "unrealized_pnl": round(mv - cost, 2),
            "unrealized_pnl_pct": round((mv - cost) / cost * 100, 2) if cost else 0.0,
        })

    accounts = {}
    for cur, t in totals.items():
        equity = t["cash"] + t["market_value"]
        start = STARTING_CASH[cur]
        accounts[cur] = {
            "cash": round(t["cash"], 2),
            "market_value": round(t["market_value"], 2),
            "equity": round(equity, 2),
            "starting_cash": start,
            "total_return_pct": round((equity - start) / start * 100, 2),
        }

    return {
        "accounts": accounts,
        "positions": rows,
        "trades": [
            {
                "id": t.id, "symbol": t.symbol, "side": t.side, "quantity": round(t.quantity, 4),
                "price": round(t.price, 4), "realized_pnl": round(t.realized_pnl or 0, 2),
                "currency": currency_of(t.symbol), "ts": t.ts.isoformat() if t.ts else None,
            }
            for t in trades
        ],
        "disclaimer": "Virtual money for practice only. Prices are delayed; no real orders are placed.",
    }


async def place_order(db: AsyncSession, user_id: str, symbol: str, side: str, quantity: float) -> dict:
    symbol = symbol.strip().upper()
    if not SYMBOL_RE.match(symbol):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid symbol")
    if side not in ("buy", "sell"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "side must be 'buy' or 'sell'")
    quantity = round(float(quantity), 4)
    if quantity <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quantity must be positive")

    try:
        quote = await providers.market.quote(symbol)
    except Exception:  # noqa: BLE001
        quote = None
    if (quote is None or not quote.price or quote.price <= 0
            or _is_sample(quote)):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No real price available for {symbol} right now")
    price = float(quote.price)

    from app.services.symbols import register_extra
    await register_extra(symbol)

    acct = await _get_or_create(db, user_id)
    cur = currency_of(symbol)
    cash_attr = _cash_attr(cur)
    pos = next((p for p in acct.positions if p.symbol == symbol), None)
    realized = 0.0

    if side == "buy":
        cost = price * quantity
        cash = getattr(acct, cash_attr)
        if cost > cash + 1e-6:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Not enough {cur} cash: need {cost:,.2f}, have {cash:,.2f}",
            )
        setattr(acct, cash_attr, cash - cost)
        if pos is None:
            acct.positions.append(PaperPosition(symbol=symbol, quantity=quantity, avg_cost=price))
        else:
            total = pos.quantity + quantity
            pos.avg_cost = (pos.avg_cost * pos.quantity + price * quantity) / total
            pos.quantity = total
    else:
        held = pos.quantity if pos else 0.0
        if pos is None or quantity > held + 1e-9:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"You hold {held:g} {symbol}; can't sell {quantity:g}",
            )
        realized = (price - pos.avg_cost) * quantity
        setattr(acct, cash_attr, getattr(acct, cash_attr) + price * quantity)
        pos.quantity = round(held - quantity, 4)
        if pos.quantity <= 1e-9:
            acct.positions.remove(pos)

    db.add(PaperTrade(
        account_id=acct.id, symbol=symbol, side=side, quantity=quantity,
        price=price, realized_pnl=realized,
    ))
    await db.flush()

    # Keep the trade log bounded so storage stays flat on the free tier.
    count = (await db.execute(
        select(func.count()).select_from(PaperTrade).where(PaperTrade.account_id == acct.id)
    )).scalar_one()
    if count > MAX_TRADES_KEPT:
        cutoff = (await db.execute(
            select(PaperTrade.id).where(PaperTrade.account_id == acct.id)
            .order_by(PaperTrade.id.desc()).offset(MAX_TRADES_KEPT - 1).limit(1)
        )).scalar_one()
        await db.execute(
            delete(PaperTrade).where(PaperTrade.account_id == acct.id, PaperTrade.id < cutoff)
        )

    await db.commit()
    return {
        "symbol": symbol, "side": side, "quantity": quantity, "price": price,
        "currency": cur, "realized_pnl": round(realized, 2),
    }


async def reset(db: AsyncSession, user_id: str) -> None:
    # Explicit deletes (rather than ORM cascades) so nothing lazy-loads under
    # asyncio and it works the same on SQLite (tests) and Postgres.
    acct_id = (await db.execute(
        select(PaperAccount.id).where(PaperAccount.user_id == user_id)
    )).scalar_one_or_none()
    if acct_id is None:
        return
    await db.execute(delete(PaperTrade).where(PaperTrade.account_id == acct_id))
    await db.execute(delete(PaperPosition).where(PaperPosition.account_id == acct_id))
    await db.execute(delete(PaperAccount).where(PaperAccount.id == acct_id))
    await db.commit()
    db.expunge_all()


BENCHMARKS = {"USD": ("SPY", "S&P 500 (SPY)"), "INR": ("^NSEI", "Nifty 50")}
HISTORY_MAX_DAYS = 365


async def history(db: AsyncSession, user_id: str, today=None) -> dict:
    """Daily account value per currency, with a benchmark index on the same
    scale ("what if the starting cash had gone into the index instead").

    Nothing extra is stored: the curve is rebuilt by walking the kept trade
    log *backwards* from today's cash and positions, and pricing each day's
    holdings with the daily closes from the history snapshot.
    """
    from datetime import datetime as _dt, timedelta, timezone as _tz

    acct = await _load(db, user_id)
    if acct is None:
        return {"curves": {}}
    trades = list((await db.execute(
        select(PaperTrade).where(PaperTrade.account_id == acct.id).order_by(PaperTrade.id.desc())
    )).scalars().all())
    if not trades:
        return {"curves": {}}

    today = today or _dt.now(_tz.utc).date()
    curves = {}
    for cur in ("USD", "INR"):
        cur_trades = [t for t in trades if currency_of(t.symbol) == cur]  # newest first
        if not cur_trades:
            continue
        first_day = min(t.ts for t in cur_trades if t.ts).date() if any(t.ts for t in cur_trades) else today
        start = max(first_day - timedelta(days=1), today - timedelta(days=HISTORY_MAX_DAYS))
        lookback = (today - start).days + 7

        symbols = sorted({t.symbol for t in cur_trades} | {p.symbol for p in acct.positions if currency_of(p.symbol) == cur})
        bench_sym, bench_name = BENCHMARKS[cur]
        closes: dict[str, dict] = {}
        for s in symbols + [bench_sym]:
            try:
                cs = await providers.market.candles(s, "1d", lookback)
            except Exception:  # noqa: BLE001
                cs = []
            closes[s] = {c.ts.date(): c.close for c in cs if c.close}

        # Trading days come from the benchmark (or any held stock).
        days = sorted(d for d in (closes.get(bench_sym) or {}) if start <= d <= today)
        if not days:
            days = sorted({d for s in symbols for d in closes.get(s, {}) if start <= d <= today})
        if not days:
            continue

        def price_on(sym, day, fallback):
            series = closes.get(sym) or {}
            best = None
            for d, c in series.items():
                if d <= day and (best is None or d > best[0]):
                    best = (d, c)
            return best[1] if best else fallback

        # Walk backwards from the current state.
        cash = getattr(acct, _cash_attr(cur))
        qty = {p.symbol: p.quantity for p in acct.positions if currency_of(p.symbol) == cur}
        last_px = {t.symbol: t.price for t in reversed(cur_trades)}  # latest trade price per symbol
        pending = list(cur_trades)  # newest first
        points = []
        for day in reversed(days):
            # Undo trades made after this day's close.
            while pending and pending[0].ts and pending[0].ts.date() > day:
                t = pending.pop(0)
                if t.side == "buy":
                    cash += t.price * t.quantity
                    qty[t.symbol] = qty.get(t.symbol, 0.0) - t.quantity
                else:
                    cash -= t.price * t.quantity
                    qty[t.symbol] = qty.get(t.symbol, 0.0) + t.quantity
            equity = cash + sum(q * price_on(s, day, last_px.get(s, 0.0)) for s, q in qty.items() if q > 1e-9)
            points.append({"date": day.isoformat(), "equity": round(equity, 2)})
        points.reverse()

        # Benchmark: the first point's equity invested in the index.
        bench = closes.get(bench_sym) or {}
        b0 = price_on(bench_sym, days[0], None)
        if b0:
            base = points[0]["equity"]
            for p, day in zip(points, days):
                b = price_on(bench_sym, day, None)
                p["benchmark"] = round(base * b / b0, 2) if b else None
        curves[cur] = {
            "points": points,
            "benchmark": bench_name if bench and b0 else None,
            "starting_cash": STARTING_CASH[cur],
            "truncated": len(trades) >= MAX_TRADES_KEPT,
        }
    return {"curves": curves}
