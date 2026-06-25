"""
Provider registry — single place that decides which concrete adapter to use.

Business code calls `providers.market`, `providers.news`, etc. and never knows
whether it is talking to a mock, yfinance, or a paid vendor. Selection is driven
purely by configuration (DATA_MODE / AI_PROVIDER).
"""
from __future__ import annotations

from functools import cached_property

from app.adapters import ai, live, mock
from app.adapters.base import (
    AIProvider, MarketDataProvider, NewsProvider, SentimentProvider,
)
from app.core.config import settings


class ProviderRegistry:
    @cached_property
    def market(self) -> MarketDataProvider:
        if settings.DATA_MODE == "live":
            return live.YFinanceMarketProvider()
        return mock.MockMarketProvider()

    @cached_property
    def news(self) -> NewsProvider:
        if settings.DATA_MODE == "live":
            return live.RSSNewsProvider()
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
        if settings.AI_PROVIDER == "ollama":
            return ai.OllamaAIProvider()
        return mock.MockAIProvider()


providers = ProviderRegistry()
