"""
Provider registry — single place that decides which concrete adapter to use.

Business code calls `providers.market`, `providers.news`, etc. and never knows
whether it is talking to a mock, yfinance, Finnhub, or Alpha Vantage. Selection
is driven by configuration (DATA_MODE / AI_PROVIDER).

In live mode, providers use a fallback chain:
  market: yfinance → Finnhub → Alpha Vantage → mock
  news:   RSS → Finnhub → mock
"""
from __future__ import annotations

from functools import cached_property

from app.adapters import ai, mock
from app.adapters.base import (
    AIProvider, MarketDataProvider, NewsProvider, SentimentProvider,
)
from app.core.config import settings


class ProviderRegistry:
    @cached_property
    def market(self) -> MarketDataProvider:
        if settings.DATA_MODE == "live":
            from app.adapters.fallback import FallbackMarketProvider
            return FallbackMarketProvider()
        return mock.MockMarketProvider()

    @cached_property
    def news(self) -> NewsProvider:
        if settings.DATA_MODE == "live":
            from app.adapters.fallback import FallbackNewsProvider
            return FallbackNewsProvider()
        return mock.MockNewsProvider()

    @cached_property
    def sentiment(self) -> SentimentProvider:
        if settings.DATA_MODE == "live":
            # Composite merges Reddit + Google Trends and fills gaps from mock,
            # so a missing key degrades that one source, not the whole snapshot.
            from app.adapters.sentiment_live import CompositeSentimentProvider
            return CompositeSentimentProvider()
        return mock.MockSentimentProvider()

    @cached_property
    def ai(self) -> AIProvider:
        if settings.AI_PROVIDER == "anthropic" and settings.ANTHROPIC_API_KEY:
            return ai.AnthropicAIProvider()
        if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            return ai.OpenAIAIProvider()
        if settings.AI_PROVIDER == "groq" and settings.GROQ_API_KEY:
            return ai.GroqAIProvider()
        if settings.AI_PROVIDER == "ollama":
            return ai.OllamaAIProvider()
        return mock.MockAIProvider()


providers = ProviderRegistry()
