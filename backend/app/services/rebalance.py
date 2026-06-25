"""
Portfolio rebalancing — detect drift and suggest trades.
"""
from __future__ import annotations

from app.adapters.registry import providers


async def analyze_drift(
    symbols: list[str],
    target_weights: dict[str, float],
    portfolio_value: float = 100000,
) -> dict:
    """
    Compare current market-cap-weighted positions vs target weights.
    Returns drift per asset and suggested trades to rebalance.
    """
    # Get current prices
    prices = {}
    for sym in symbols:
        try:
            q = await providers.market.quote(sym)
            prices[sym] = q.price
        except Exception:
            prices[sym] = 0

    # Normalize target weights
    total_w = sum(target_weights.values())
    if total_w > 0:
        target_weights = {k: v / total_w for k, v in target_weights.items()}

    # Current allocation based on equal-dollar investment at current prices
    # (If user has actual shares, they'd pass those — this is the baseline)
    current_weights = {}
    total = sum(prices[s] for s in symbols if prices[s] > 0)
    if total > 0:
        for s in symbols:
            current_weights[s] = prices[s] / total if prices[s] > 0 else 0

    # Drift analysis
    assets = []
    trades = []
    max_drift = 0

    for sym in symbols:
        target = target_weights.get(sym, 0)
        current = current_weights.get(sym, 0)
        drift = current - target
        drift_pct = drift * 100

        target_value = target * portfolio_value
        current_value = current * portfolio_value
        trade_value = target_value - current_value
        trade_shares = (trade_value / prices[sym]) if prices[sym] > 0 else 0

        max_drift = max(max_drift, abs(drift_pct))

        asset = {
            "symbol": sym,
            "price": prices[sym],
            "target_weight": round(target * 100, 2),
            "current_weight": round(current * 100, 2),
            "drift_pct": round(drift_pct, 2),
            "target_value": round(target_value, 2),
            "current_value": round(current_value, 2),
            "trade_value": round(trade_value, 2),
            "trade_shares": round(trade_shares, 2),
            "action": "BUY" if trade_value > 10 else "SELL" if trade_value < -10 else "HOLD",
        }
        assets.append(asset)

        if abs(trade_value) > 10:
            trades.append({
                "symbol": sym,
                "action": asset["action"],
                "shares": abs(asset["trade_shares"]),
                "value": abs(asset["trade_value"]),
            })

    # Rebalancing cost estimate (assuming $0 commission, just tracking)
    total_trade_volume = sum(t["value"] for t in trades)
    turnover = total_trade_volume / portfolio_value * 100 if portfolio_value > 0 else 0

    return {
        "portfolio_value": portfolio_value,
        "assets": sorted(assets, key=lambda x: abs(x["drift_pct"]), reverse=True),
        "trades": sorted(trades, key=lambda x: x["value"], reverse=True),
        "summary": {
            "max_drift_pct": round(max_drift, 2),
            "total_trade_volume": round(total_trade_volume, 2),
            "turnover_pct": round(turnover, 2),
            "num_trades": len(trades),
            "needs_rebalance": max_drift > 5,  # >5% drift threshold
        },
    }
