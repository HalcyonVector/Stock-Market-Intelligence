"""Pydantic models for the watchlist API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class ItemCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class ItemOut(BaseModel):
    id: int
    symbol: str


class WatchlistOut(BaseModel):
    id: int
    name: str
    items: list[ItemOut] = []


class WatchlistWithQuotes(WatchlistOut):
    quotes: list[dict] = []
