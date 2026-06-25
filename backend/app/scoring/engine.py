"""
Transparent scoring engine.

Design principle: EVERY score must be explainable. Each scorer returns not just a
number but the inputs, the weighted contributions, a human-readable explanation,
and a confidence level driven by data completeness. The frontend renders these
breakdowns directly — nothing is a black box.

All scores are normalised to 0..100 (except sentiment which is signed -100..100)
so they can be combined and compared across symbols and markets.
"""
from __future__ import annotations

from dataclasses import dataclass, field


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


@dataclass
class ScoreResult:
    name: str
    value: float
    confidence: float                       # 0..1
    weights: dict[str, float]
    contributions: dict[str, float]
    inputs: dict[str, float]
    explanation: str
    formula: str


@dataclass
class ScoreInputs:
    change_pct: float = 0.0
    volume_ratio: float = 1.0               # volume / avg_volume
    rsi: float = 50.0
    return_20d: float = 0.0                  # pct
    rel_strength: float = 0.0                # vs sector/index, pct
    sentiment_score: float = 0.0            # -1..1
    sentiment_growth: float = 0.0           # pct
    mention_volume: int = 0
    attention: float = 0.0                   # 0..100
    inst_flow: float = 0.0                   # net institutional flow, normalised -1..1
    beta: float = 1.0
    volatility: float = 0.0                  # annualised pct
    drawdown: float = 0.0                    # pct (positive number)
    data_completeness: float = 1.0          # 0..1, fraction of inputs present


# --- Individual scorers -----------------------------------------------------

def momentum_score(i: ScoreInputs) -> ScoreResult:
    weights = {"change_pct": 0.30, "return_20d": 0.30, "volume_ratio": 0.20, "rsi": 0.20}
    formula = "0.30*price_move + 0.30*ret20d + 0.20*volume_ratio + 0.20*rsi_centered"
    c = {
        "change_pct": _clamp(50 + i.change_pct * 4) * weights["change_pct"],
        "return_20d": _clamp(50 + i.return_20d * 1.5) * weights["return_20d"],
        "volume_ratio": _clamp(i.volume_ratio * 33) * weights["volume_ratio"],
        "rsi": _clamp(i.rsi) * weights["rsi"],
    }
    val = _clamp(sum(c.values()))
    expl = (
        f"Momentum {val:.0f}/100 driven by a {i.change_pct:+.1f}% move, "
        f"{i.return_20d:+.1f}% 20-day return and {i.volume_ratio:.1f}x average volume."
    )
    return ScoreResult("momentum", round(val, 1), i.data_completeness, weights, c,
                       i.__dict__.copy(), expl, formula)


def sentiment_score(i: ScoreInputs) -> ScoreResult:
    weights = {"sentiment_score": 0.5, "sentiment_growth": 0.3, "attention": 0.2}
    formula = "100*(0.5*sentiment + 0.3*tanh(growth) + 0.2*attention_norm)"
    import math
    c = {
        "sentiment_score": i.sentiment_score * 100 * weights["sentiment_score"],
        "sentiment_growth": math.tanh(i.sentiment_growth / 100) * 100 * weights["sentiment_growth"],
        "attention": (i.attention - 50) * 2 * weights["attention"],
    }
    val = max(-100.0, min(100.0, sum(c.values())))
    mood = "bullish" if val > 15 else "bearish" if val < -15 else "neutral"
    expl = (
        f"Retail sentiment is {mood} ({val:+.0f}). Net tone {i.sentiment_score:+.2f}, "
        f"mention growth {i.sentiment_growth:+.0f}%, attention {i.attention:.0f}/100."
    )
    return ScoreResult("sentiment", round(val, 1), i.data_completeness, weights, c,
                       i.__dict__.copy(), expl, formula)


def risk_score(i: ScoreInputs) -> ScoreResult:
    """Higher = riskier."""
    weights = {"volatility": 0.4, "beta": 0.25, "drawdown": 0.2, "volume_ratio": 0.15}
    formula = "0.4*vol_norm + 0.25*beta_norm + 0.20*drawdown_norm + 0.15*volume_spike"
    c = {
        "volatility": _clamp(i.volatility * 1.5) * weights["volatility"],
        "beta": _clamp(i.beta * 40) * weights["beta"],
        "drawdown": _clamp(i.drawdown * 2) * weights["drawdown"],
        "volume_ratio": _clamp(abs(i.volume_ratio - 1) * 50) * weights["volume_ratio"],
    }
    val = _clamp(sum(c.values()))
    band = "high" if val > 66 else "moderate" if val > 33 else "low"
    expl = (
        f"Risk {val:.0f}/100 ({band}). Volatility {i.volatility:.0f}%, beta {i.beta:.2f}, "
        f"max drawdown {i.drawdown:.0f}%."
    )
    return ScoreResult("risk", round(val, 1), i.data_completeness, weights, c,
                       i.__dict__.copy(), expl, formula)


def attention_score(i: ScoreInputs) -> ScoreResult:
    weights = {"mention_volume": 0.4, "sentiment_growth": 0.4, "attention": 0.2}
    formula = "0.4*log_mentions + 0.4*growth_norm + 0.2*attention"
    import math
    c = {
        "mention_volume": _clamp(math.log10(max(i.mention_volume, 1)) * 25) * weights["mention_volume"],
        "sentiment_growth": _clamp(50 + i.sentiment_growth / 6) * weights["sentiment_growth"],
        "attention": _clamp(i.attention) * weights["attention"],
    }
    val = _clamp(sum(c.values()))
    expl = (
        f"Market attention {val:.0f}/100 from {i.mention_volume:,} mentions "
        f"growing {i.sentiment_growth:+.0f}%."
    )
    return ScoreResult("attention", round(val, 1), i.data_completeness, weights, c,
                       i.__dict__.copy(), expl, formula)


def opportunity_score(i: ScoreInputs) -> ScoreResult:
    """
    Composite headline score. Combines the sub-scores plus institutional flow and
    relative strength, then penalises for risk. This is what powers the
    Opportunity Radar and homepage rankings.
    """
    mom = momentum_score(i).value
    sen = (sentiment_score(i).value + 100) / 2          # to 0..100
    att = attention_score(i).value
    risk = risk_score(i).value
    inst = _clamp(50 + i.inst_flow * 50)
    rel = _clamp(50 + i.rel_strength * 2)

    weights = {
        "momentum": 0.25, "sentiment": 0.15, "attention": 0.10,
        "institutional": 0.20, "relative_strength": 0.15, "risk_penalty": 0.15,
    }
    formula = (
        "0.25*momentum + 0.15*sentiment + 0.10*attention + 0.20*institutional "
        "+ 0.15*rel_strength - 0.15*risk"
    )
    c = {
        "momentum": mom * weights["momentum"],
        "sentiment": sen * weights["sentiment"],
        "attention": att * weights["attention"],
        "institutional": inst * weights["institutional"],
        "relative_strength": rel * weights["relative_strength"],
        "risk_penalty": -risk * weights["risk_penalty"],
    }
    val = _clamp(sum(c.values()) + 50 * weights["risk_penalty"])  # re-center penalty
    expl = (
        f"Opportunity {val:.0f}/100: momentum {mom:.0f}, institutional flow {inst:.0f}, "
        f"relative strength {rel:.0f}, tempered by risk {risk:.0f}."
    )
    return ScoreResult("opportunity", round(val, 1), i.data_completeness, weights, c,
                       i.__dict__.copy(), expl, formula)


def all_scores(i: ScoreInputs) -> dict[str, ScoreResult]:
    return {
        "opportunity": opportunity_score(i),
        "momentum": momentum_score(i),
        "sentiment": sentiment_score(i),
        "risk": risk_score(i),
        "attention": attention_score(i),
    }
