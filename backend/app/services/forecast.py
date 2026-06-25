"""
ML price forecasting using simple statistical methods.

Uses exponential smoothing + linear regression ensemble.
Falls back gracefully if prophet/sklearn unavailable.
"""
from __future__ import annotations

import json
import numpy as np
from datetime import datetime, timezone, timedelta

from app.adapters.registry import providers
from app.core.redis import get_redis

CACHE_TTL = 600


def _linear_forecast(closes: np.ndarray, days_ahead: int) -> dict:
    """Simple linear regression forecast with confidence bands."""
    n = len(closes)
    x = np.arange(n)
    y = np.log(closes)  # Log transform for better linearity

    # Fit linear regression
    x_mean = np.mean(x)
    y_mean = np.mean(y)
    ss_xy = np.sum((x - x_mean) * (y - y_mean))
    ss_xx = np.sum((x - x_mean) ** 2)

    slope = ss_xy / ss_xx
    intercept = y_mean - slope * x_mean

    # Residual standard error
    y_pred = slope * x + intercept
    residuals = y - y_pred
    se = np.sqrt(np.sum(residuals ** 2) / (n - 2))

    # Forecast
    future_x = np.arange(n, n + days_ahead)
    forecast_log = slope * future_x + intercept
    forecast = np.exp(forecast_log)

    # Confidence intervals (expanding with time)
    ci_factor = np.sqrt(1 + 1 / n + (future_x - x_mean) ** 2 / ss_xx)
    upper_95 = np.exp(forecast_log + 1.96 * se * ci_factor)
    lower_95 = np.exp(forecast_log - 1.96 * se * ci_factor)
    upper_80 = np.exp(forecast_log + 1.28 * se * ci_factor)
    lower_80 = np.exp(forecast_log - 1.28 * se * ci_factor)

    # Annualized trend
    daily_return = slope
    annual_return = (np.exp(daily_return * 252) - 1) * 100

    return {
        "forecast": forecast.tolist(),
        "upper_95": upper_95.tolist(),
        "lower_95": lower_95.tolist(),
        "upper_80": upper_80.tolist(),
        "lower_80": lower_80.tolist(),
        "trend_annual_pct": round(annual_return, 2),
        "r_squared": round(1 - np.sum(residuals ** 2) / np.sum((y - y_mean) ** 2), 4),
    }


def _exp_smoothing_forecast(closes: np.ndarray, days_ahead: int, alpha: float = 0.3) -> dict:
    """Double exponential smoothing (Holt's method)."""
    n = len(closes)

    # Initialize
    level = closes[0]
    trend = np.mean(np.diff(closes[:10]))

    levels = [level]
    trends = [trend]

    for i in range(1, n):
        new_level = alpha * closes[i] + (1 - alpha) * (level + trend)
        new_trend = 0.1 * (new_level - level) + 0.9 * trend
        level = new_level
        trend = new_trend
        levels.append(level)
        trends.append(trend)

    # Forecast
    forecast = []
    for h in range(1, days_ahead + 1):
        forecast.append(level + h * trend)

    # Estimate uncertainty from historical errors
    fitted = [levels[i] for i in range(n)]
    errors = [closes[i] - fitted[i] for i in range(n)]
    rmse = np.sqrt(np.mean(np.array(errors) ** 2))

    upper_95 = [f + 1.96 * rmse * np.sqrt(h) for h, f in enumerate(forecast, 1)]
    lower_95 = [f - 1.96 * rmse * np.sqrt(h) for h, f in enumerate(forecast, 1)]

    return {
        "forecast": forecast,
        "upper_95": upper_95,
        "lower_95": lower_95,
        "rmse": round(rmse, 4),
    }


async def forecast_price(symbol: str, days_ahead: int = 30) -> dict:
    cache_key = f"forecast:{symbol}:{days_ahead}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    candles = await providers.market.candles(symbol, "1d", 365)
    if len(candles) < 60:
        return {"error": f"Insufficient data for {symbol}"}

    closes = np.array([c.close for c in candles])
    timestamps = [str(c.ts)[:10] for c in candles]

    # Run both models
    linear = _linear_forecast(closes, days_ahead)
    exp_smooth = _exp_smoothing_forecast(closes, days_ahead)

    # Ensemble: weighted average (linear gets more weight for trend, exp for level)
    ensemble_forecast = [
        0.4 * linear["forecast"][i] + 0.6 * exp_smooth["forecast"][i]
        for i in range(days_ahead)
    ]
    ensemble_upper = [
        0.4 * linear["upper_95"][i] + 0.6 * exp_smooth["upper_95"][i]
        for i in range(days_ahead)
    ]
    ensemble_lower = [
        0.4 * linear["lower_95"][i] + 0.6 * exp_smooth["lower_95"][i]
        for i in range(days_ahead)
    ]

    # Generate future dates
    last_date = datetime.strptime(timestamps[-1], "%Y-%m-%d")
    future_dates = []
    current = last_date
    for _ in range(days_ahead):
        current += timedelta(days=1)
        while current.weekday() >= 5:  # Skip weekends
            current += timedelta(days=1)
        future_dates.append(current.strftime("%Y-%m-%d"))

    # Build chart data
    # Historical (last 90 days for context)
    hist_start = max(0, len(closes) - 90)
    chart_data = []
    for i in range(hist_start, len(closes)):
        chart_data.append({
            "t": timestamps[i][5:],
            "actual": round(closes[i], 2),
        })

    # Forecast
    for i in range(days_ahead):
        chart_data.append({
            "t": future_dates[i][5:],
            "forecast": round(ensemble_forecast[i], 2),
            "upper_95": round(ensemble_upper[i], 2),
            "lower_95": round(ensemble_lower[i], 2),
            "upper_80": round(0.4 * linear["upper_80"][i] + 0.6 * (ensemble_forecast[i] + (ensemble_upper[i] - ensemble_forecast[i]) * 0.65), 2),
            "lower_80": round(0.4 * linear["lower_80"][i] + 0.6 * (ensemble_forecast[i] - (ensemble_forecast[i] - ensemble_lower[i]) * 0.65), 2),
        })

    current_price = float(closes[-1])
    forecast_end = ensemble_forecast[-1]
    forecast_change = (forecast_end - current_price) / current_price * 100

    result = {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "forecast_end_price": round(forecast_end, 2),
        "forecast_change_pct": round(forecast_change, 2),
        "forecast_high": round(max(ensemble_upper), 2),
        "forecast_low": round(min(ensemble_lower), 2),
        "days_ahead": days_ahead,
        "chart_data": chart_data,
        "models": {
            "linear": {
                "r_squared": linear["r_squared"],
                "trend_annual_pct": linear["trend_annual_pct"],
            },
            "exp_smoothing": {
                "rmse": exp_smooth["rmse"],
            },
        },
        "method": "Linear Regression + Holt Exponential Smoothing Ensemble",
        "disclaimer": "Statistical forecast only. Not a prediction or investment advice. Past patterns do not guarantee future results.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
    except Exception:
        pass

    return result
