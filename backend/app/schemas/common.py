"""Shared API response envelopes."""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

DISCLAIMER = "Educational and informational use only. Not personalized investment advice."


class Envelope(BaseModel, Generic[T]):
    data: T
    disclaimer: str = DISCLAIMER
    meta: dict[str, Any] = {}
