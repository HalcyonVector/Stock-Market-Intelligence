"""
SQLAlchemy ORM models (async). Mirror of db/schema.sql.

Time-series tables (price_snapshots, sentiment_events, sector_snapshots,
opportunity_scores) are append-only and indexed on (symbol, ts) for fast latest
+ range queries. See docs/DATABASE.md for the full indexing rationale.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func, Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(256), index=True)
    sector: Mapped[str] = mapped_column(String(64), index=True)
    industry: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    stocks: Mapped[list["Stock"]] = relationship(back_populates="company")


class Stock(Base):
    __tablename__ = "stocks"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    market: Mapped[str] = mapped_column(String(8), index=True)        # US/IN/...
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    market_cap: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    company: Mapped[Company | None] = relationship(back_populates="stocks")
    __table_args__ = (UniqueConstraint("symbol", "market", name="uq_symbol_market"),)


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price: Mapped[float] = mapped_column(Float)
    change_pct: Mapped[float] = mapped_column(Float)
    volume: Mapped[int] = mapped_column(BigInteger)
    avg_volume: Mapped[int] = mapped_column(BigInteger)
    __table_args__ = (Index("ix_price_symbol_ts", "symbol", "ts"),)


class NewsArticle(Base):
    __tablename__ = "news_articles"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    headline: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(128))
    summary: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    __table_args__ = (UniqueConstraint("url", name="uq_news_url"),)


class SentimentEvent(Base):
    __tablename__ = "sentiment_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32))                   # reddit/twitter/trends
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    mention_volume: Mapped[int] = mapped_column(Integer)
    sentiment_score: Mapped[float] = mapped_column(Float)
    attention_score: Mapped[float] = mapped_column(Float)
    growth_rate: Mapped[float] = mapped_column(Float)
    __table_args__ = (Index("ix_sentiment_symbol_ts", "symbol", "ts"),)


class SectorSnapshot(Base):
    __tablename__ = "sector_snapshots"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sector: Mapped[str] = mapped_column(String(64))
    market: Mapped[str] = mapped_column(String(8))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    momentum: Mapped[float] = mapped_column(Float)
    net_flow: Mapped[float] = mapped_column(Float)
    __table_args__ = (Index("ix_sector_ts", "sector", "ts"),)


class OpportunityScore(Base):
    __tablename__ = "opportunity_scores"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    opportunity: Mapped[float] = mapped_column(Float)
    momentum: Mapped[float] = mapped_column(Float)
    sentiment: Mapped[float] = mapped_column(Float)
    risk: Mapped[float] = mapped_column(Float)
    attention: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    __table_args__ = (Index("ix_opp_symbol_ts", "symbol", "ts"),
                      Index("ix_opp_ts_score", "ts", "opportunity"))


class MarketEvent(Base):
    __tablename__ = "market_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    type: Mapped[str] = mapped_column(String(48), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="low")
    payload: Mapped[str] = mapped_column(Text)                        # JSON string
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class InsightReport(Base):
    __tablename__ = "insight_reports"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(32))                     # explanation/briefing/weekly
    content: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="{}")         # JSON string
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())


class Watchlist(Base):
    __tablename__ = "watchlists"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(128))
    items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id"))
    symbol: Mapped[str] = mapped_column(String(32))
    watchlist: Mapped[Watchlist] = relationship(back_populates="items")
    __table_args__ = (UniqueConstraint("watchlist_id", "symbol", name="uq_wl_symbol"),)
