"""Lightweight technical indicators used to derive ScoreInputs from candles."""
from __future__ import annotations

from statistics import pstdev

from app.adapters.base import Candle, Quote, SentimentSnapshot
from app.scoring.engine import ScoreInputs


def rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for a, b in zip(closes[-period - 1:], closes[-period:]):
        diff = b - a
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period or 1e-9
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def annualised_vol(closes: list[float]) -> float:
    if len(closes) < 2:
        return 0.0
    rets = [(b - a) / a for a, b in zip(closes, closes[1:]) if a]
    return round(pstdev(rets) * (252 ** 0.5) * 100, 1) if rets else 0.0


def max_drawdown(closes: list[float]) -> float:
    peak, mdd = closes[0] if closes else 0, 0.0
    for c in closes:
        peak = max(peak, c)
        if peak:
            mdd = max(mdd, (peak - c) / peak)
    return round(mdd * 100, 1)


def build_inputs(
    quote: Quote,
    candles: list[Candle],
    sentiment: list[SentimentSnapshot] | None = None,
    rel_strength: float = 0.0,
    inst_flow: float = 0.0,
    beta: float = 1.0,
) -> ScoreInputs:
    closes = [c.close for c in candles] or [quote.price]
    ret20 = ((closes[-1] - closes[-20]) / closes[-20] * 100) if len(closes) >= 20 else 0.0
    sent = sentiment or []
    avg_sent = sum(s.sentiment_score for s in sent) / len(sent) if sent else 0.0
    avg_growth = sum(s.growth_rate for s in sent) / len(sent) if sent else 0.0
    mentions = sum(s.mention_volume for s in sent)
    attention = max((s.attention_score for s in sent), default=0.0)
    completeness = sum([bool(candles), bool(sent), inst_flow != 0]) / 3 or 0.34
    return ScoreInputs(
        change_pct=quote.change_pct,
        volume_ratio=quote.volume / quote.avg_volume if quote.avg_volume else 1.0,
        rsi=rsi(closes),
        return_20d=round(ret20, 2),
        rel_strength=rel_strength,
        sentiment_score=round(avg_sent, 2),
        sentiment_growth=round(avg_growth, 1),
        mention_volume=mentions,
        attention=attention,
        inst_flow=inst_flow,
        beta=beta,
        volatility=annualised_vol(closes),
        drawdown=max_drawdown(closes),
        data_completeness=round(completeness, 2),
    )
