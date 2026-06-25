"""
Strategy backtester — define rules, test against history.

Supports: RSI crossover, MACD crossover, SMA crossover, price threshold.
Returns: trade log, P&L curve, win rate, Sharpe, max drawdown.
"""
from __future__ import annotations

import json
import numpy as np
from datetime import datetime, timezone

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


async def backtest_strategy(
    symbol: str,
    strategy: str,
    params: dict | None = None,
    initial_capital: float = 10000,
    lookback: int = 365,
) -> dict:
    cache_key = f"backtest:{symbol}:{strategy}:{lookback}"
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

    # Simulate trades
    result = _simulate(closes, timestamps, signals, initial_capital)

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


def _simulate(closes: np.ndarray, timestamps: list, signals: list, initial_capital: float) -> dict:
    capital = initial_capital
    shares = 0
    position = False
    trades = []
    equity_curve = []
    entry_price = 0

    for i in range(len(closes)):
        portfolio_value = capital + shares * closes[i]

        if signals[i] == 1 and not position:
            # Buy
            shares = capital / closes[i]
            entry_price = closes[i]
            capital = 0
            position = True
            trades.append({
                "date": timestamps[i],
                "action": "BUY",
                "price": round(closes[i], 2),
                "shares": round(shares, 4),
                "value": round(shares * closes[i], 2),
            })

        elif signals[i] == -1 and position:
            # Sell
            capital = shares * closes[i]
            pnl = (closes[i] - entry_price) / entry_price * 100
            trades.append({
                "date": timestamps[i],
                "action": "SELL",
                "price": round(closes[i], 2),
                "shares": round(shares, 4),
                "value": round(capital, 2),
                "pnl_pct": round(pnl, 2),
            })
            shares = 0
            position = False

        portfolio_value = capital + shares * closes[i]
        # Downsample equity curve
        if i % 3 == 0 or i == len(closes) - 1:
            equity_curve.append({
                "t": timestamps[i],
                "value": round(portfolio_value, 2),
                "benchmark": round(initial_capital * closes[i] / closes[0], 2),
            })

    final_value = capital + shares * closes[-1]
    total_return = (final_value - initial_capital) / initial_capital * 100
    benchmark_return = (closes[-1] - closes[0]) / closes[0] * 100

    # Trade stats
    sell_trades = [t for t in trades if t["action"] == "SELL"]
    wins = [t for t in sell_trades if t.get("pnl_pct", 0) > 0]
    losses = [t for t in sell_trades if t.get("pnl_pct", 0) <= 0]

    # Max drawdown from equity curve
    peak = initial_capital
    max_dd = 0
    for pt in equity_curve:
        if pt["value"] > peak:
            peak = pt["value"]
        dd = (peak - pt["value"]) / peak * 100
        max_dd = max(max_dd, dd)

    # Daily returns for Sharpe
    values = [p["value"] for p in equity_curve]
    if len(values) > 1:
        rets = np.diff(values) / values[:-1]
        sharpe = np.mean(rets) / np.std(rets) * np.sqrt(252) if np.std(rets) > 0 else 0
    else:
        sharpe = 0

    return {
        "final_value": round(final_value, 2),
        "total_return_pct": round(total_return, 2),
        "benchmark_return_pct": round(benchmark_return, 2),
        "alpha": round(total_return - benchmark_return, 2),
        "num_trades": len(trades),
        "num_wins": len(wins),
        "num_losses": len(losses),
        "win_rate": round(len(wins) / len(sell_trades) * 100, 1) if sell_trades else 0,
        "avg_win": round(np.mean([t["pnl_pct"] for t in wins]), 2) if wins else 0,
        "avg_loss": round(np.mean([t["pnl_pct"] for t in losses]), 2) if losses else 0,
        "max_drawdown_pct": round(max_dd, 2),
        "sharpe_ratio": round(sharpe, 2),
        "trades": trades[-20:],  # Last 20 trades
        "equity_curve": equity_curve,
    }


def list_strategies() -> list[dict]:
    return [{"id": k, **v} for k, v in STRATEGIES.items()]
