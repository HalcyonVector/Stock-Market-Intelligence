"""
Flagship "Why is this stock moving?" service.

It assembles structured evidence (price action, volume, news, sentiment, sector,
scores), asks the AI provider to synthesise an explanation, and returns the
explanation ALONGSIDE the raw evidence + a confidence score. The UI shows both,
so every claim is traceable to a signal — never an unsourced assertion.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.scoring.engine import all_scores
from app.scoring.indicators import build_inputs

SYSTEM = (
    "You are a market intelligence analyst for an EDUCATIONAL research platform. "
    "Explain WHY a stock moved using ONLY the structured signals provided. "
    "Cite the specific signals you rely on. Never give buy/sell advice or price "
    "targets. Be concise (3-5 sentences). If evidence is weak, say so."
)


def _confidence(signals: dict) -> float:
    """Confidence rises with corroborating, non-conflicting evidence."""
    present = sum([
        bool(signals["news"]),
        abs(signals["quote"]["change_pct"]) > 1,
        signals["volume_ratio"] > 1.3,
        bool(signals["sentiment"]["aggregate"]),
    ])
    return round(min(1.0, 0.4 + present * 0.15), 2)


async def why_moving(symbol: str) -> dict:
    from app.services.sentiment import for_symbol

    # Fetch all data in parallel
    quote_t, candles_t, news_t, snaps_t, sentiment_t = await asyncio.gather(
        providers.market.quote(symbol),
        providers.market.candles(symbol, "1d", 60),
        providers.news.latest(symbol, limit=5),
        providers.sentiment.snapshot(symbol),
        for_symbol(symbol),
    )
    quote, candles, news, snaps, sentiment = quote_t, candles_t, news_t, snaps_t, sentiment_t

    inputs = build_inputs(quote, candles, snaps)
    scores = all_scores(inputs)

    signals = {
        "quote": quote.__dict__,
        "volume_ratio": round(quote.volume / quote.avg_volume, 2) if quote.avg_volume else 1.0,
        "news": [n.__dict__ for n in news],
        "sentiment": sentiment,
        "scores": {k: v.value for k, v in scores.items()},
    }

    prompt = _build_prompt(symbol, signals)
    explanation = await providers.ai.explain(SYSTEM, prompt)

    timeline = _timeline(quote, news)
    return {
        "symbol": symbol,
        "explanation": explanation,
        "confidence": _confidence(signals),
        "supporting_signals": signals,
        "timeline": timeline,
        "scores": {k: v.__dict__ for k, v in scores.items()},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Educational use only. Not investment advice.",
    }


def _build_prompt(symbol: str, s: dict) -> str:
    headlines = "\n".join(f"- {n['headline']} ({n['source']})" for n in s["news"][:5]) or "- none"
    agg = s["sentiment"].get("aggregate", {})
    return (
        f"Symbol: {symbol}\n"
        f"Price move today: {s['quote']['change_pct']:+.2f}% to {s['quote']['price']}\n"
        f"Volume vs average: {s['volume_ratio']}x\n"
        f"Momentum score: {s['scores']['momentum']}/100\n"
        f"Sentiment score: {s['scores']['sentiment']} (mentions {agg.get('mention_volume', 0)}, "
        f"growth {agg.get('growth_rate', 0)}%)\n"
        f"Recent headlines:\n{headlines}\n\n"
        f"Explain the move using these signals."
    )


def _timeline(quote, news) -> list[dict]:
    events = [{
        "ts": quote.ts.isoformat() if hasattr(quote.ts, "isoformat") else str(quote.ts),
        "type": "price",
        "label": f"Traded at {quote.price} ({quote.change_pct:+.2f}%)",
    }]
    for n in news[:5]:
        events.append({
            "ts": n.published_at.isoformat() if hasattr(n.published_at, "isoformat") else str(n.published_at),
            "type": "news",
            "label": n.headline,
        })
    return sorted(events, key=lambda e: e["ts"], reverse=True)
