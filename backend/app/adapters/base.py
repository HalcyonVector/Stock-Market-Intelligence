"""
Provider adapter contracts.

Every external data source is hidden behind one of these abstract interfaces.
The rest of the application depends ONLY on these protocols, never on a concrete
vendor. This is the seam that lets us swap mock <-> yfinance <-> Polygon without
touching business logic, and makes the platform market-agnostic (US/IN/GLOBAL).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Quote:
    symbol: str
    price: float
    change: float
    change_pct: float
    volume: int
    avg_volume: int
    market_cap: float | None
    currency: str
    market: str
    ts: datetime


@dataclass
class Candle:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class CompanyProfile:
    symbol: str
    name: str
    sector: str
    industry: str
    market: str
    currency: str
    market_cap: float | None
    description: str = ""


@dataclass
class NewsItem:
    symbol: str | None
    headline: str
    url: str
    source: str
    published_at: datetime
    summary: str = ""


@dataclass
class SentimentSnapshot:
    symbol: str
    source: str                 # reddit | twitter | trends
    mention_volume: int
    sentiment_score: float      # -1..1
    attention_score: float      # 0..100
    growth_rate: float          # pct change vs prior window
    ts: datetime
    samples: list[str] = field(default_factory=list)


class MarketDataProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    async def quotes(self, symbols: list[str]) -> list[Quote]: ...

    @abstractmethod
    async def candles(self, symbol: str, interval: str, lookback: int) -> list[Candle]: ...

    @abstractmethod
    async def profile(self, symbol: str) -> CompanyProfile: ...

    @abstractmethod
    async def universe(self, market: str) -> list[str]:
        """Return the symbol universe used for discovery scans."""


class NewsProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def latest(self, symbol: str | None = None, limit: int = 20) -> list[NewsItem]: ...


class SentimentProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def snapshot(self, symbol: str) -> list[SentimentSnapshot]: ...


class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def explain(self, system: str, prompt: str) -> str: ...
