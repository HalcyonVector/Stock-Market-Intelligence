"""
Technical analysis indicators.

Computed from candle data: RSI, MACD, Bollinger Bands, SMA, EMA, ATR, Stochastic, VWAP, OBV.
"""
from __future__ import annotations

import json

import numpy as np

from app.adapters.registry import providers
from app.core.redis import get_redis


def _ema(data: np.ndarray, period: int) -> np.ndarray:
    """Exponential moving average."""
    alpha = 2 / (period + 1)
    result = np.zeros_like(data)
    result[0] = data[0]
    for i in range(1, len(data)):
        result[i] = alpha * data[i] + (1 - alpha) * result[i - 1]
    return result


def _sma(data: np.ndarray, period: int) -> np.ndarray:
    """Simple moving average."""
    result = np.full_like(data, np.nan)
    for i in range(period - 1, len(data)):
        result[i] = np.mean(data[i - period + 1:i + 1])
    return result


def _rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Relative Strength Index."""
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    avg_gain = np.zeros(len(deltas))
    avg_loss = np.zeros(len(deltas))

    # Initial SMA
    if period < len(gains):
        avg_gain[period - 1] = np.mean(gains[:period])
        avg_loss[period - 1] = np.mean(losses[:period])

        for i in range(period, len(deltas)):
            avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i]) / period
            avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i]) / period

    rs = np.divide(avg_gain, avg_loss, where=avg_loss != 0, out=np.zeros_like(avg_gain))
    rsi = 100 - (100 / (1 + rs))
    # Prepend NaN for alignment with close prices
    return np.concatenate([[np.nan], rsi])


def _macd(closes: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    """MACD line, signal line, histogram."""
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return {
        "macd": macd_line.tolist(),
        "signal": signal_line.tolist(),
        "histogram": histogram.tolist(),
    }


def _bollinger(closes: np.ndarray, period: int = 20, std_dev: float = 2.0) -> dict:
    """Bollinger Bands."""
    sma = _sma(closes, period)
    rolling_std = np.full_like(closes, np.nan)
    for i in range(period - 1, len(closes)):
        rolling_std[i] = np.std(closes[i - period + 1:i + 1])
    upper = sma + std_dev * rolling_std
    lower = sma - std_dev * rolling_std
    # %B: where price sits in the band (0 = lower, 1 = upper)
    band_width = upper - lower
    pct_b = np.divide(closes - lower, band_width, where=band_width != 0, out=np.full_like(closes, 0.5))
    return {
        "upper": upper.tolist(),
        "middle": sma.tolist(),
        "lower": lower.tolist(),
        "pct_b": pct_b.tolist(),
        "bandwidth": (band_width / sma * 100).tolist(),
    }


def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Average True Range."""
    tr = np.zeros(len(closes))
    tr[0] = highs[0] - lows[0]
    for i in range(1, len(closes)):
        tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
    atr = np.zeros_like(tr)
    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, len(tr)):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


def _stochastic(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, k_period: int = 14, d_period: int = 3) -> dict:
    """Stochastic Oscillator (%K, %D)."""
    k = np.full_like(closes, np.nan)
    for i in range(k_period - 1, len(closes)):
        h = np.max(highs[i - k_period + 1:i + 1])
        l = np.min(lows[i - k_period + 1:i + 1])
        k[i] = ((closes[i] - l) / (h - l) * 100) if h != l else 50.0
    d = _sma(k, d_period)
    return {"k": k.tolist(), "d": d.tolist()}


def _obv(closes: np.ndarray, volumes: np.ndarray) -> np.ndarray:
    """On-Balance Volume."""
    obv = np.zeros(len(closes))
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv[i] = obv[i - 1] + volumes[i]
        elif closes[i] < closes[i - 1]:
            obv[i] = obv[i - 1] - volumes[i]
        else:
            obv[i] = obv[i - 1]
    return obv


async def compute(symbol: str, lookback: int = 180) -> dict:
    """Compute all technical indicators for a symbol."""
    cache_key = f"technicals:{symbol}:{lookback}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    candles = await providers.market.candles(symbol, "1d", lookback)
    if len(candles) < 30:
        return {"error": f"Insufficient data for {symbol}"}

    closes = np.array([c.close for c in candles])
    highs = np.array([c.high for c in candles])
    lows = np.array([c.low for c in candles])
    volumes = np.array([c.volume for c in candles], dtype=float)
    timestamps = [str(c.ts)[:10] if hasattr(c.ts, 'isoformat') else str(c.ts)[:10] for c in candles]

    rsi = _rsi(closes)
    macd = _macd(closes)
    bollinger = _bollinger(closes)
    atr = _atr(highs, lows, closes)
    stoch = _stochastic(highs, lows, closes)
    obv = _obv(closes, volumes)

    sma_20 = _sma(closes, 20)
    sma_50 = _sma(closes, 50)
    ema_12 = _ema(closes, 12)
    ema_26 = _ema(closes, 26)

    # Current signal summary
    current_rsi = float(rsi[-1]) if not np.isnan(rsi[-1]) else 50.0
    current_macd = float(macd["macd"][-1])
    current_signal = float(macd["signal"][-1])
    current_price = float(closes[-1])
    current_bb_pctb = float(bollinger["pct_b"][-1]) if not np.isnan(bollinger["pct_b"][-1]) else 0.5
    current_stoch_k = float(stoch["k"][-1]) if not np.isnan(stoch["k"][-1]) else 50.0

    signals = {
        "rsi": {
            "value": round(current_rsi, 1),
            "signal": "oversold" if current_rsi < 30 else "overbought" if current_rsi > 70 else "neutral",
        },
        "macd": {
            "value": round(current_macd, 4),
            "signal": "bullish" if current_macd > current_signal else "bearish",
            "crossover": abs(current_macd - current_signal) < abs(current_macd) * 0.1,
        },
        "bollinger": {
            "pct_b": round(current_bb_pctb, 2),
            "signal": "oversold" if current_bb_pctb < 0.05 else "overbought" if current_bb_pctb > 0.95 else "neutral",
        },
        "stochastic": {
            "k": round(current_stoch_k, 1),
            "signal": "oversold" if current_stoch_k < 20 else "overbought" if current_stoch_k > 80 else "neutral",
        },
        "trend": {
            "above_sma20": current_price > float(sma_20[-1]) if not np.isnan(sma_20[-1]) else False,
            "above_sma50": current_price > float(sma_50[-1]) if not np.isnan(sma_50[-1]) else False,
            "signal": "bullish" if (not np.isnan(sma_20[-1]) and current_price > float(sma_20[-1])) else "bearish",
        },
    }

    def _clean(arr):
        return [None if np.isnan(v) else round(float(v), 4) for v in arr]

    result = {
        "symbol": symbol,
        "timestamps": timestamps,
        "close": closes.tolist(),
        "high": highs.tolist(),
        "low": lows.tolist(),
        "volume": volumes.tolist(),
        "rsi": _clean(rsi),
        "macd": {k: [round(float(v), 4) for v in vs] for k, vs in macd.items()},
        "bollinger": {k: _clean(np.array(vs)) for k, vs in bollinger.items()},
        "atr": _clean(atr),
        "stochastic": {k: _clean(np.array(vs)) for k, vs in stoch.items()},
        "obv": obv.tolist(),
        "sma_20": _clean(sma_20),
        "sma_50": _clean(sma_50),
        "ema_12": _clean(ema_12),
        "ema_26": _clean(ema_26),
        "signals": signals,
    }

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=300)
    except Exception:
        pass

    return result
