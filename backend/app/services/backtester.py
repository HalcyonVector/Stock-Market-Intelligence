"""
Strategy backtester — define rules, test against history.

Supports: RSI crossover, MACD crossover, SMA crossover, price threshold.
Returns: trade log, P&L curve, win rate, Sharpe, max drawdown, both before
and after trading costs (and, for NSE stocks, Indian capital-gains tax).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

import numpy as np

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services.technicals import _rsi, _ema, _sma, _macd


STRATEGIES = {
    "rsi_oversold": {
        "name": "RSI Mean Reversion",
        "description": "Buy when RSI < buy_threshold, sell when RSI > sell_threshold",
        "params": {"buy_threshold": 30, "sell_threshold": 70, "period": 14},
    },
    "macd_crossover": {
        "name": "MACD Crossover",
        "description": "Buy when MACD crosses above signal, sell when crosses below",
        "params": {"fast": 12, "slow": 26, "signal": 9},
    },
    "sma_crossover": {
        "name": "SMA Crossover",
        "description": "Buy when short SMA crosses above long SMA (golden cross), sell on death cross",
        "params": {"short_period": 20, "long_period": 50},
    },
    "bollinger_bounce": {
        "name": "Bollinger Bounce",
        "description": "Buy when price touches lower band, sell at upper band",
        "params": {"period": 20, "std_dev": 2.0},
    },
}



@dataclass(frozen=True)
class Costs:
    """Per-side costs as a fraction of trade value, and whether Indian
    capital-gains tax applies."""
    market: str
    currency: str
    buy: float
    sell: float
    india_tax: bool
    notes: tuple[str, ...]


# Slippage: half of a typical bid-ask spread for large, liquid stocks.
_SLIP = 0.0005

# NSE equity delivery, from Zerodha's published charges (zerodha.com/charges,
# checked Nov 2026): zero brokerage, STT 0.1% on buy and sell, NSE transaction
# charge 0.00307%, SEBI fee Rs 10 per crore (0.0001%), stamp duty 0.015% on
# buys, and 18% GST on transaction charge plus SEBI fee.
_NSE_TXN, _SEBI, _STT, _STAMP, _GST = 0.0000307, 0.000001, 0.001, 0.00015, 0.18
IN_COSTS = Costs(
    market="IN", currency="INR",
    buy=_STT + _NSE_TXN + _SEBI + _STAMP + _GST * (_NSE_TXN + _SEBI) + _SLIP,
    sell=_STT + _NSE_TXN + _SEBI + _GST * (_NSE_TXN + _SEBI) + _SLIP,
    india_tax=True,
    notes=(
        "Zero brokerage (delivery at a discount broker)",
        "STT 0.1% on buy and sell, stamp duty 0.015% on buys",
        "NSE transaction charge, SEBI fee and GST",
        "0.05% slippage each side",
        "Indian capital-gains tax plus 4% cess: 20% on gains held up to a year, "
        "12.5% above Rs 1.25 lakh on gains held longer",
    ),
)
# US: most brokers charge no commission and the regulatory sell fees are a
# fraction of a cent, so slippage is the cost that matters. Tax depends on
# where the investor lives, so none is deducted.
US_COSTS = Costs(
    market="US", currency="USD", buy=_SLIP, sell=_SLIP, india_tax=False,
    notes=("Zero commission", "0.05% slippage each side",
           "No tax deducted: it depends on where you live"),
)

STCG_RATE, LTCG_RATE, LTCG_EXEMPT, CESS = 0.20, 0.125, 125_000.0, 0.04


def costs_for(symbol: str) -> Costs:
    from app.adapters.history_store import is_indian

    return IN_COSTS if is_indian(symbol) else US_COSTS


def india_tax(gains: list[tuple[float, int]]) -> float:
    """Indian tax on realised gains, given (gain, days held) per round trip.
    Short-term losses offset either kind of gain; long-term losses only
    long-term gains. Long-term gains up to Rs 1.25 lakh a year are exempt."""
    st = sum(g for g, d in gains if d <= 365)
    lt = sum(g for g, d in gains if d > 365)
    if st < 0:
        lt += st
        st = 0.0
    taxable_lt = max(0.0, lt - LTCG_EXEMPT)
    return (STCG_RATE * max(st, 0.0) + LTCG_RATE * taxable_lt) * (1 + CESS)


async def backtest_strategy(
    symbol: str,
    strategy: str,
    params: dict | None = None,
    initial_capital: float = 10000,
    lookback: int = 365,
) -> dict:
    cache_key = f"backtest:v2:{symbol}:{strategy}:{lookback}:{initial_capital}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    candles = await providers.market.candles(symbol, "1d", lookback)
    if len(candles) < 60:
        return {"error": f"Insufficient data for {symbol}"}

    closes = np.array([c.close for c in candles])
    highs = np.array([c.high for c in candles])
    lows = np.array([c.low for c in candles])
    timestamps = [str(c.ts)[:10] for c in candles]

    strat_info = STRATEGIES.get(strategy, STRATEGIES["rsi_oversold"])
    p = {**strat_info["params"], **(params or {})}

    # Generate buy/sell signals
    signals = _generate_signals(strategy, closes, highs, lows, p)

    # Simulate trades: once as-is, once after costs and tax. The net run is
    # the headline; the gross numbers show what the costs took.
    costs = costs_for(symbol)
    gross = _simulate(closes, timestamps, signals, initial_capital)
    result = _simulate(closes, timestamps, signals, initial_capital, costs)
    result["gross"] = {k: gross[k] for k in
                       ("final_value", "total_return_pct", "benchmark_return_pct", "alpha", "win_rate", "sharpe_ratio")}
    for pt, g in zip(result["equity_curve"], gross["equity_curve"]):
        pt["gross"] = g["value"]
    result["costs"] = {"market": costs.market, "currency": costs.currency, "notes": list(costs.notes),
                       "buy_pct": round(costs.buy * 100, 4), "sell_pct": round(costs.sell * 100, 4)}

    result["symbol"] = symbol
    result["strategy"] = strategy
    result["strategy_name"] = strat_info["name"]
    result["strategy_description"] = strat_info["description"]
    result["params"] = p
    result["initial_capital"] = initial_capital
    result["lookback_days"] = lookback

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=600)
    except Exception:
        pass

    return result


def _generate_signals(strategy: str, closes: np.ndarray, highs: np.ndarray, lows: np.ndarray, params: dict) -> list[int]:
    """Generate signals: 1=buy, -1=sell, 0=hold."""
    n = len(closes)
    signals = [0] * n

    if strategy == "rsi_oversold":
        rsi = _rsi(closes, params["period"])
        for i in range(1, n):
            if not np.isnan(rsi[i]):
                if rsi[i] < params["buy_threshold"]:
                    signals[i] = 1
                elif rsi[i] > params["sell_threshold"]:
                    signals[i] = -1

    elif strategy == "macd_crossover":
        macd_data = _macd(closes, params["fast"], params["slow"], params["signal"])
        macd_line = macd_data["macd"]
        signal_line = macd_data["signal"]
        for i in range(1, n):
            if macd_line[i] > signal_line[i] and macd_line[i - 1] <= signal_line[i - 1]:
                signals[i] = 1
            elif macd_line[i] < signal_line[i] and macd_line[i - 1] >= signal_line[i - 1]:
                signals[i] = -1

    elif strategy == "sma_crossover":
        short_sma = _sma(closes, params["short_period"])
        long_sma = _sma(closes, params["long_period"])
        for i in range(1, n):
            if not np.isnan(short_sma[i]) and not np.isnan(long_sma[i]):
                if not np.isnan(short_sma[i - 1]) and not np.isnan(long_sma[i - 1]):
                    if short_sma[i] > long_sma[i] and short_sma[i - 1] <= long_sma[i - 1]:
                        signals[i] = 1
                    elif short_sma[i] < long_sma[i] and short_sma[i - 1] >= long_sma[i - 1]:
                        signals[i] = -1

    elif strategy == "bollinger_bounce":
        sma = _sma(closes, params["period"])
        for i in range(params["period"] - 1, n):
            std = np.std(closes[i - params["period"] + 1:i + 1])
            upper = sma[i] + params["std_dev"] * std
            lower = sma[i] - params["std_dev"] * std
            if closes[i] <= lower:
                signals[i] = 1
            elif closes[i] >= upper:
                signals[i] = -1

    return signals


def _days(a: str, b: str) -> int:
    try:
        return (date.fromisoformat(b[:10]) - date.fromisoformat(a[:10])).days
    except ValueError:
        return 0


def _simulate(closes: np.ndarray, timestamps: list, signals: list, initial_capital: float,
              costs: Costs | None = None) -> dict:
    """All-in, all-out simulation. With ``costs``, every buy and sell pays the
    per-side costs, and the final figures assume everything is sold on the
    last day (for the strategy and for buy-and-hold alike), with Indian tax on
    realised gains when it applies."""
    buy_c = costs.buy if costs else 0.0
    sell_c = costs.sell if costs else 0.0
    capital = initial_capital
    shares = 0.0
    position = False
    trades = []
    equity_curve = []
    daily_values = []
    entry_price = 0.0
    entry_cost = 0.0       # cash spent on the open position, costs included
    entry_date = ""
    realised: list[tuple[float, int]] = []
    costs_paid = 0.0

    for i in range(len(closes)):
        if signals[i] == 1 and not position:
            shares = capital / (closes[i] * (1 + buy_c))
            costs_paid += capital - shares * closes[i]
            entry_price, entry_cost, entry_date = closes[i], capital, timestamps[i]
            capital = 0.0
            position = True
            trades.append({
                "date": timestamps[i],
                "action": "BUY",
                "price": round(closes[i], 2),
                "shares": round(shares, 4),
                "value": round(shares * closes[i], 2),
            })

        elif signals[i] == -1 and position:
            gross_value = shares * closes[i]
            capital = gross_value * (1 - sell_c)
            costs_paid += gross_value - capital
            realised.append((capital - entry_cost, _days(entry_date, timestamps[i])))
            trades.append({
                "date": timestamps[i],
                "action": "SELL",
                "price": round(closes[i], 2),
                "shares": round(shares, 4),
                "value": round(capital, 2),
                # Return on the cash put in, so costs show up in each trade.
                "pnl_pct": round((capital - entry_cost) / entry_cost * 100, 2),
            })
            shares = 0.0
            position = False

        portfolio_value = capital + shares * closes[i]
        daily_values.append(portfolio_value)
        # Downsample equity curve
        if i % 3 == 0 or i == len(closes) - 1:
            equity_curve.append({
                "t": timestamps[i],
                "value": round(portfolio_value, 2),
                "benchmark": round(initial_capital / (1 + buy_c) * closes[i] / closes[0], 2),
            })

    final_value = capital + shares * closes[-1]
    tax_paid = 0.0
    if costs:
        # Close any open position on the last day.
        if position:
            gross_value = shares * closes[-1]
            final_value = gross_value * (1 - sell_c)
            costs_paid += gross_value - final_value
            realised.append((final_value - entry_cost, _days(entry_date, timestamps[-1])))
        if costs.india_tax:
            tax_paid = india_tax(realised)
            final_value -= tax_paid

    # Buy and hold on the same terms: one buy, one sale on the last day, tax.
    bh_shares = initial_capital / (closes[0] * (1 + buy_c))
    bh_final = bh_shares * closes[-1] * (1 - sell_c)
    if costs and costs.india_tax:
        bh_final -= india_tax([(bh_final - initial_capital, _days(timestamps[0], timestamps[-1]))])
    total_return = (final_value - initial_capital) / initial_capital * 100
    benchmark_return = (bh_final - initial_capital) / initial_capital * 100

    # Trade stats
    sell_trades = [t for t in trades if t["action"] == "SELL"]
    wins = [t for t in sell_trades if t.get("pnl_pct", 0) > 0]
    losses = [t for t in sell_trades if t.get("pnl_pct", 0) <= 0]

    # Max drawdown and Sharpe from the daily values (the chart is downsampled).
    vals = np.array(daily_values, dtype=float)
    peaks = np.maximum.accumulate(vals) if len(vals) else vals
    max_dd = float(((peaks - vals) / peaks).max() * 100) if len(vals) else 0.0
    if len(vals) > 1:
        rets = np.diff(vals) / vals[:-1]
        sd = np.std(rets)
        sharpe = float(np.mean(rets) / sd * np.sqrt(252)) if sd > 0 else 0.0
    else:
        sharpe = 0.0

    return {
        "final_value": round(final_value, 2),
        "total_return_pct": round(total_return, 2),
        "benchmark_return_pct": round(benchmark_return, 2),
        "alpha": round(total_return - benchmark_return, 2),
        "num_trades": len(trades),
        "num_wins": len(wins),
        "num_losses": len(losses),
        "win_rate": round(len(wins) / len(sell_trades) * 100, 1) if sell_trades else 0,
        "avg_win": round(float(np.mean([t["pnl_pct"] for t in wins])), 2) if wins else 0,
        "avg_loss": round(float(np.mean([t["pnl_pct"] for t in losses])), 2) if losses else 0,
        "max_drawdown_pct": round(max_dd, 2),
        "sharpe_ratio": round(sharpe, 2),
        "costs_paid": round(costs_paid, 2),
        "tax_paid": round(tax_paid, 2),
        "trades": trades[-20:],  # Last 20 trades
        "equity_curve": equity_curve,
    }


def list_strategies() -> list[dict]:
    return [{"id": k, **v} for k, v in STRATEGIES.items()]
