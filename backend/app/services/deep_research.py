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

import json
from datetime import datetime, timezone

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import technicals, fundamentals

CACHE_TTL = 600  # 10 minutes

SYSTEM_PROMPT = """You are a senior equity research analyst at a top-tier investment bank.
You produce EDUCATIONAL research reports — not investment advice. Never recommend buy/sell/hold.

You receive structured data about a stock. Your job is to synthesize it into a comprehensive
research memo with these sections:

1. EXECUTIVE SUMMARY (2-3 sentences on key takeaways)
2. TECHNICAL ANALYSIS (RSI, MACD, Bollinger, trend, support/resistance observations)
3. FUNDAMENTAL ASSESSMENT (valuation relative to peers, margins, growth trajectory)
4. SENTIMENT & CATALYSTS (news themes, market sentiment, upcoming events)
5. RISK FACTORS (3-5 concrete risks specific to this company)
6. OUTLOOK (1 paragraph synthesizing all signals into a balanced outlook)

Rules:
- Cite specific numbers from the data provided
- Be balanced — present both bull and bear cases
- Use professional financial language
- Keep total length under 800 words
- Do NOT give price targets or ratings
- Disclaimer: This is educational content, not investment advice
"""


async def research(symbol: str) -> dict:
    cache_key = f"deep_research:{symbol}"
    r = get_redis()
    try:
        hit = await r.get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass

    # Gather all data
    quote = await providers.market.quote(symbol)
    news = await providers.news.latest(symbol, limit=8)
    tech = await technicals.compute(symbol, 180)
    fund = await fundamentals.get_fundamentals(symbol)

    from app.services.sentiment import for_symbol
    sentiment = await for_symbol(symbol)

    # Build comprehensive prompt
    prompt = _build_research_prompt(symbol, quote, tech, fund, news, sentiment)

    # Call AI
    try:
        analysis = await providers.ai.explain(SYSTEM_PROMPT, prompt)
    except Exception as e:
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
