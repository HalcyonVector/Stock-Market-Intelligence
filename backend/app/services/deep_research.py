"""
AI deep research — comprehensive Ollama-powered stock analysis.

Goes beyond "why moving" to produce a full research report:
- Executive summary
- Technical analysis summary
- Fundamental assessment
- Sentiment & news digest
- Risk factors
- Competitive positioning
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from app.core.logging import get_logger

log = get_logger("services.deep_research")

# How long to wait on each phase before returning a graceful partial report.
DATA_TIMEOUT = 25.0   # gathering quote/news/technicals/fundamentals/sentiment
AI_TIMEOUT = 90.0     # local model synthesis

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import technicals, fundamentals

CACHE_TTL = 600  # 10 minutes

SYSTEM_PROMPT = """You are a senior equity research analyst at a top-tier investment bank.
You produce EDUCATIONAL research reports — not investment advice. Never recommend buy/sell/hold.

You receive structured data about a stock. Your job is to synthesize it into a comprehensive
research memo. Output valid Markdown using ## headings for each section, as follows:

## Executive Summary
2-3 sentences on key takeaways.

## Technical Analysis
RSI, MACD, Bollinger, trend, support/resistance observations.

## Fundamental Assessment
Valuation relative to peers, margins, growth trajectory.

## Sentiment & Catalysts
News themes, market sentiment, upcoming events.

## Risk Factors
3-5 concrete risks as a bullet list (use - for each).

## Outlook
1 paragraph synthesising all signals into a balanced view.

Rules:
- Use ## for all section headings — never bold-only labels
- Use bullet lists (- item) for Risk Factors
- Cite specific numbers from the data provided
- Be balanced — present both bull and bear cases
- Use professional financial language
- Keep total length under 800 words
- Do NOT give price targets or ratings
"""


async def analyze(symbol: str) -> dict:
    cache_key = f"deep_research:{symbol}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    from app.services.sentiment import for_symbol

    # Gather all data in parallel, bounded so a slow/hanging provider can't
    # stall the whole report. Missing pieces degrade gracefully to defaults.
    quote = news = tech = fund = sentiment = None
    try:
        quote, news, tech, fund, sentiment = await asyncio.wait_for(
            asyncio.gather(
                providers.market.quote(symbol),
                providers.news.latest(symbol, limit=8),
                technicals.compute(symbol, 180),
                fundamentals.get_fundamentals(symbol),
                for_symbol(symbol),
            ),
            timeout=DATA_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log.warning("deep_research.data_timeout", symbol=symbol)
    except Exception as e:  # noqa: BLE001
        log.warning("deep_research.data_error", symbol=symbol, error=str(e))

    news = news or []
    tech = tech or {}
    fund = fund or {}
    sentiment = sentiment or {}

    if quote is None:
        # Without a quote we can't build a meaningful report.
        return {
            "symbol": symbol,
            "name": fund.get("name", symbol),
            "sector": fund.get("sector", "—"),
            "industry": fund.get("industry", "—"),
            "analysis": "Research data is temporarily unavailable. Please retry in a moment.",
            "data_summary": {},
            "news": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "disclaimer": "Educational research only. Not investment advice.",
            "partial": True,
        }

    # Build comprehensive prompt
    prompt = _build_research_prompt(symbol, quote, tech, fund, news, sentiment)

    # Call AI, bounded so a slow local model returns a graceful message
    # instead of hanging until the client/proxy kills the request.
    try:
        analysis = await asyncio.wait_for(
            providers.ai.explain(SYSTEM_PROMPT, prompt), timeout=AI_TIMEOUT
        )
    except asyncio.TimeoutError:
        log.warning("deep_research.ai_timeout", symbol=symbol)
        analysis = (
            "AI synthesis timed out (the local model is busy). "
            "The structured metrics below are still current — please retry the "
            "full report in a moment."
        )
    except Exception as e:  # noqa: BLE001
        log.warning("deep_research.ai_error", symbol=symbol, error=str(e))
        analysis = f"AI analysis unavailable: {e}"

    result = {
        "symbol": symbol,
        "name": fund.get("name", symbol),
        "sector": fund.get("sector", "—"),
        "industry": fund.get("industry", "—"),
        "analysis": analysis,
        "data_summary": {
            "price": quote.price,
            "change_pct": quote.change_pct,
            "market_cap": fund.get("market_cap"),
            "pe": fund.get("pe_trailing"),
            "rsi": tech.get("signals", {}).get("rsi", {}).get("value"),
            "macd_signal": tech.get("signals", {}).get("macd", {}).get("signal"),
            "trend": tech.get("signals", {}).get("trend", {}).get("signal"),
            "recommendation": fund.get("recommendation"),
            "target_mean": fund.get("target_mean"),
            "num_analysts": fund.get("num_analysts"),
        },
        "news": [{"headline": n.headline, "source": n.source, "url": n.url} for n in news[:6]],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Educational research only. Not investment advice.",
    }

    try:
        await r.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL)
    except Exception:
        pass

    return result


def _build_research_prompt(symbol, quote, tech, fund, news, sentiment) -> str:
    signals = tech.get("signals", {})
    headlines = "\n".join(f"- {n.headline} ({n.source})" for n in news[:6]) or "- None"
    agg = sentiment.get("aggregate", {})

    vol_ratio = round(quote.volume / quote.avg_volume, 2) if quote.avg_volume else 1.0

    sections = [
        f"=== STOCK: {symbol} ({fund.get('name', symbol)}) ===",
        f"Sector: {fund.get('sector', '?')} | Industry: {fund.get('industry', '?')}",
        f"Country: {fund.get('country', '?')} | Exchange: {fund.get('exchange', '?')}",
        "",
        "--- PRICE ACTION ---",
        f"Current Price: ${quote.price:.2f} ({quote.change_pct:+.2f}% today)",
        f"Volume: {quote.volume:,.0f} ({vol_ratio}x average)",
        f"52W Range: ${fund.get('fifty_two_week_low', '?')} – ${fund.get('fifty_two_week_high', '?')}",
        f"50-day MA: ${fund.get('fifty_day_avg', '?')} | 200-day MA: ${fund.get('two_hundred_day_avg', '?')}",
        "",
        "--- TECHNICAL INDICATORS ---",
        f"RSI (14): {signals.get('rsi', {}).get('value', '?')} — {signals.get('rsi', {}).get('signal', '?')}",
        f"MACD: {signals.get('macd', {}).get('value', '?')} — {signals.get('macd', {}).get('signal', '?')}",
        f"Bollinger %B: {signals.get('bollinger', {}).get('pct_b', '?')} — {signals.get('bollinger', {}).get('signal', '?')}",
        f"Stochastic %K: {signals.get('stochastic', {}).get('k', '?')} — {signals.get('stochastic', {}).get('signal', '?')}",
        f"Trend (vs SMA20/50): {signals.get('trend', {}).get('signal', '?')}",
        "",
        "--- FUNDAMENTALS ---",
        f"Market Cap: ${fund.get('market_cap', 0) / 1e9:.1f}B" if fund.get("market_cap") else "Market Cap: N/A",
        f"P/E (TTM): {fund.get('pe_trailing', '?')} | P/E (Fwd): {fund.get('pe_forward', '?')}",
        f"PEG: {fund.get('peg_ratio', '?')} | P/B: {fund.get('price_to_book', '?')}",
        f"Revenue: ${fund.get('revenue', 0) / 1e9:.1f}B" if fund.get("revenue") else "Revenue: N/A",
        f"Revenue Growth: {fund.get('revenue_growth', '?')} | Earnings Growth: {fund.get('earnings_growth', '?')}",
        f"Gross Margin: {fund.get('gross_margins', '?')} | Profit Margin: {fund.get('profit_margins', '?')}",
        f"Debt/Equity: {fund.get('debt_to_equity', '?')} | Current Ratio: {fund.get('current_ratio', '?')}",
        f"EPS: ${fund.get('eps_trailing', '?')} | Book Value: ${fund.get('book_value', '?')}",
        f"Dividend Yield: {fund.get('dividend_yield', '?')} | Beta: {fund.get('beta', '?')}",
        f"Short Ratio: {fund.get('short_ratio', '?')}",
        "",
        "--- ANALYST CONSENSUS ---",
        f"Rating: {fund.get('recommendation', '?')} ({fund.get('num_analysts', 0)} analysts)",
        f"Price Targets: Low ${fund.get('target_low', '?')} / Mean ${fund.get('target_mean', '?')} / High ${fund.get('target_high', '?')}",
        "",
        "--- SENTIMENT ---",
        f"Mention Volume: {agg.get('mention_volume', 0)}",
        f"Sentiment Trend: {agg.get('sentiment_label', '?')}",
        f"Growth Rate: {agg.get('growth_rate', 0)}%",
        "",
        "--- RECENT NEWS ---",
        headlines,
        "",
        "Write a comprehensive research memo based on ALL the data above.",
    ]

    return "\n".join(sections)


# Backward-compatible alias (older callers used research()).
research = analyze
