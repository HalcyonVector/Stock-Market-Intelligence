"""
Live retail-sentiment adapters (all free).

  * RedditSentimentProvider  — praw, free Reddit app credentials.
  * GoogleTrendsProvider     — pytrends, free (unofficial).
  * CompositeSentimentProvider — merges whatever sources are configured and
    fills the rest from mock, so the API always returns a full snapshot set.

Sentiment of free text is scored with a tiny built-in lexicon (no heavy NLP
dependency, no API cost). It is intentionally simple and transparent; swap in a
finBERT model later behind the same interface if desired.
"""
from __future__ import annotations

import asyncio
import math
import re
from datetime import datetime, timezone

from app.adapters.base import SentimentProvider, SentimentSnapshot
from app.adapters.mock import MockSentimentProvider
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.sentiment")

# Minimal finance-flavoured polarity lexicon (-1..1 contribution per hit).
_POS = {"beat", "beats", "bullish", "buy", "moon", "surge", "soar", "rally",
        "upgrade", "growth", "profit", "record", "strong", "gain", "outperform"}
_NEG = {"miss", "misses", "bearish", "sell", "crash", "plunge", "drop", "downgrade",
        "loss", "weak", "lawsuit", "fraud", "cut", "warn", "underperform", "dump"}
_TOKEN = re.compile(r"[a-zA-Z']+")


def score_text(text: str) -> float:
    toks = [t.lower() for t in _TOKEN.findall(text or "")]
    if not toks:
        return 0.0
    s = sum((1 if t in _POS else -1 if t in _NEG else 0) for t in toks)
    return max(-1.0, min(1.0, s / math.sqrt(len(toks))))


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RedditSentimentProvider(SentimentProvider):
    name = "reddit"

    def __init__(self) -> None:
        self._fallback = MockSentimentProvider()

    async def snapshot(self, symbol: str) -> list[SentimentSnapshot]:
        if not (settings.REDDIT_CLIENT_ID and settings.REDDIT_CLIENT_SECRET):
            return [s for s in await self._fallback.snapshot(symbol) if s.source == "reddit"]
        try:
            return await asyncio.to_thread(self._fetch, symbol)
        except Exception as e:  # noqa: BLE001
            log.warning("reddit.fallback", symbol=symbol, error=str(e))
            return [s for s in await self._fallback.snapshot(symbol) if s.source == "reddit"]

    def _fetch(self, symbol: str) -> list[SentimentSnapshot]:
        import praw

        reddit = praw.Reddit(
            client_id=settings.REDDIT_CLIENT_ID,
            client_secret=settings.REDDIT_CLIENT_SECRET,
            user_agent=settings.REDDIT_USER_AGENT,
            check_for_async=False,
        )
        texts, mentions = [], 0
        for sub in ("stocks", "wallstreetbets", "investing"):
            for post in reddit.subreddit(sub).search(symbol, sort="new", limit=25, time_filter="week"):
                mentions += 1
                texts.append(f"{post.title} {getattr(post, 'selftext', '')[:200]}")
        polarity = sum(score_text(t) for t in texts) / len(texts) if texts else 0.0
        return [SentimentSnapshot(
            symbol=symbol, source="reddit", mention_volume=mentions,
            sentiment_score=round(polarity, 2),
            attention_score=round(min(100.0, math.log10(mentions + 1) * 33), 1),
            growth_rate=0.0,  # requires prior-window store; filled by ETL diffing
            ts=_now(), samples=texts[:3],
        )]


class GoogleTrendsProvider(SentimentProvider):
    name = "trends"

    def __init__(self) -> None:
        self._fallback = MockSentimentProvider()

    async def snapshot(self, symbol: str) -> list[SentimentSnapshot]:
        try:
            return await asyncio.to_thread(self._fetch, symbol)
        except Exception as e:  # noqa: BLE001
            log.warning("trends.fallback", symbol=symbol, error=str(e))
            return [s for s in await self._fallback.snapshot(symbol) if s.source == "trends"]

    def _fetch(self, symbol: str) -> list[SentimentSnapshot]:
        from pytrends.request import TrendReq

        py = TrendReq(hl="en-US", tz=0)
        py.build_payload([symbol], timeframe="now 7-d")
        df = py.interest_over_time()
        if df is None or df.empty:
            raise ValueError("no trends data")
        series = df[symbol]
        latest = float(series.iloc[-1])
        prior = float(series.iloc[0]) or 1.0
        growth = (latest - prior) / prior * 100
        return [SentimentSnapshot(
            symbol=symbol, source="trends",
            mention_volume=int(latest),                 # 0..100 interest index
            sentiment_score=0.0,                        # trends is attention, not tone
            attention_score=round(latest, 1),
            growth_rate=round(growth, 1),
            ts=_now(), samples=[],
        )]


class CompositeSentimentProvider(SentimentProvider):
    """Merge live sources; fill missing sources from mock for a complete view."""
    name = "composite"

    def __init__(self) -> None:
        self._reddit = RedditSentimentProvider()
        self._trends = GoogleTrendsProvider()
        self._mock = MockSentimentProvider()

    async def snapshot(self, symbol: str) -> list[SentimentSnapshot]:
        results = await asyncio.gather(
            self._reddit.snapshot(symbol),
            self._trends.snapshot(symbol),
            return_exceptions=True,
        )
        out: list[SentimentSnapshot] = []
        for r in results:
            if isinstance(r, list):
                out.extend(r)
        have = {s.source for s in out}
        for s in await self._mock.snapshot(symbol):
            if s.source not in have:
                out.append(s)
        return out
