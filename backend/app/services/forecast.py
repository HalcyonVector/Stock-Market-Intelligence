"""
Price forecasting.

Primary model is SARIMA (Seasonal ARIMA via statsmodels) fitted on log prices,
which produces a principled mean forecast and model-derived 80% / 95% confidence
bands. If statsmodels is unavailable or the fit fails to converge, it falls back
to a lightweight ensemble of a log-linear regression trend and Holt's double
exponential smoothing so the endpoint always returns a usable forecast.
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


def _sarima_forecast(
    closes: np.ndarray,
    days_ahead: int,
    order: tuple[int, int, int] = (1, 1, 1),
    seasonal_order: tuple[int, int, int, int] = (1, 0, 1, 5),
) -> dict | None:
    """Seasonal ARIMA forecast on log prices with 80%/95% confidence bands.

    Returns ``None`` (so the caller can fall back) if statsmodels is missing or
    the model fails to fit/converge. A trading-week season (s=5) captures weak
    day-of-week structure without assuming strong seasonality.
    """
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    except Exception:
        return None

    try:
        y = np.log(closes.astype(float))
        model = SARIMAX(
            y,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fit = model.fit(disp=False, maxiter=200)

        fc = fit.get_forecast(steps=days_ahead)
        mean_log = np.asarray(fc.predicted_mean)
        ci95 = np.asarray(fc.conf_int(alpha=0.05))  # 95%
        ci80 = np.asarray(fc.conf_int(alpha=0.20))  # 80%

        forecast = np.exp(mean_log)
        # In-sample one-step residual RMSE (log scale) as a fit-quality signal.
        resid = np.asarray(fit.resid)
        resid = resid[np.isfinite(resid)]
        rmse = float(np.sqrt(np.mean(resid[1:] ** 2))) if resid.size > 1 else float("nan")

        return {
            "forecast": forecast.tolist(),
            "upper_95": np.exp(ci95[:, 1]).tolist(),
            "lower_95": np.exp(ci95[:, 0]).tolist(),
            "upper_80": np.exp(ci80[:, 1]).tolist(),
            "lower_80": np.exp(ci80[:, 0]).tolist(),
            "aic": round(float(fit.aic), 2),
            "bic": round(float(fit.bic), 2),
            "rmse_log": round(rmse, 5) if np.isfinite(rmse) else None,
            "order": list(order),
            "seasonal_order": list(seasonal_order),
        }
    except Exception:
        return None


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

    # Linear fit is always computed — cheap, and supplies the R²/trend readout.
    linear = _linear_forecast(closes, days_ahead)

    # Primary model: SARIMA. Fall back to the linear+Holt ensemble if it is
    # unavailable or fails to converge, so the endpoint never hard-fails.
    sarima = _sarima_forecast(closes, days_ahead)

    if sarima is not None:
        fc_mid = sarima["forecast"]
        fc_u95, fc_l95 = sarima["upper_95"], sarima["lower_95"]
        fc_u80, fc_l80 = sarima["upper_80"], sarima["lower_80"]
        so = sarima["seasonal_order"]
        method = (
            f"SARIMA{tuple(sarima['order'])}{tuple(so[:3])}[{so[3]}] "
            "seasonal time-series model"
        )
        models = {
            "linear": {
                "r_squared": linear["r_squared"],
                "trend_annual_pct": linear["trend_annual_pct"],
            },
            "sarima": {
                "order": sarima["order"],
                "seasonal_order": sarima["seasonal_order"],
                "aic": sarima["aic"],
                "bic": sarima["bic"],
                "rmse_log": sarima["rmse_log"],
            },
        }
    else:
        exp_smooth = _exp_smoothing_forecast(closes, days_ahead)
        # Ensemble: weighted average (linear weights trend, exp weights level).
        fc_mid = [
            0.4 * linear["forecast"][i] + 0.6 * exp_smooth["forecast"][i]
            for i in range(days_ahead)
        ]
        fc_u95 = [
            0.4 * linear["upper_95"][i] + 0.6 * exp_smooth["upper_95"][i]
            for i in range(days_ahead)
        ]
        fc_l95 = [
            0.4 * linear["lower_95"][i] + 0.6 * exp_smooth["lower_95"][i]
            for i in range(days_ahead)
        ]
        fc_u80 = [
            0.4 * linear["upper_80"][i] + 0.6 * (fc_mid[i] + (fc_u95[i] - fc_mid[i]) * 0.65)
            for i in range(days_ahead)
        ]
        fc_l80 = [
            0.4 * linear["lower_80"][i] + 0.6 * (fc_mid[i] - (fc_mid[i] - fc_l95[i]) * 0.65)
            for i in range(days_ahead)
        ]
        method = "Linear Regression + Holt Exponential Smoothing Ensemble (SARIMA fallback)"
        models = {
            "linear": {
                "r_squared": linear["r_squared"],
                "trend_annual_pct": linear["trend_annual_pct"],
            },
            "exp_smoothing": {"rmse": exp_smooth["rmse"]},
        }

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
            "forecast": round(fc_mid[i], 2),
            "upper_95": round(fc_u95[i], 2),
            "lower_95": round(fc_l95[i], 2),
            "upper_80": round(fc_u80[i], 2),
            "lower_80": round(fc_l80[i], 2),
        })

    current_price = float(closes[-1])
    forecast_end = fc_mid[-1]
    forecast_change = (forecast_end - current_price) / current_price * 100

    result = {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "forecast_end_price": round(forecast_end, 2),
        "forecast_change_pct": round(forecast_change, 2),
        "forecast_high": round(max(fc_u95), 2),
        "forecast_low": round(min(fc_l95), 2),
        "days_ahead": days_ahead,
        "chart_data": chart_data,
        "models": models,
        "method": method,
        "disclaimer": "Statistical forecast only. Not a prediction or investment advice. Past patterns do not guarantee future results.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
    except Exception:
        pass

    return result
