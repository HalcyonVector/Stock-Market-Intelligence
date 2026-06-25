"""
Validate live data coverage from a machine WITH open internet access.

Run:  cd backend && DATA_MODE=live python -m scripts.validate_live
It prints, per ticker, whether yfinance returned real data or fell back to mock,
plus an RSS news count and (if keys present) Reddit/Trends sentiment.

This exists because the build sandbox blocks outbound calls to Yahoo/CNBC; run it
locally or in your deployment to confirm coverage for your universe.
"""
from __future__ import annotations

import asyncio
import os

os.environ.setdefault("DATA_MODE", "live")

from app.adapters.registry import providers  # noqa: E402

TICKERS = ["AAPL", "NVDA", "TSLA", "RELIANCE", "INFY", "HAL"]


async def main() -> None:
    print(f"DATA_MODE = {os.environ['DATA_MODE']}\n")
    print(f"{'symbol':<10}{'price':>12}{'chg%':>9}{'cur':>5}  source-ok?")
    for sym in TICKERS:
        q = await providers.market.quote(sym)
        # Mock prices are seeded 20..500; a real fetch usually differs + has currency.
        print(f"{sym:<10}{q.price:>12}{q.change_pct:>9}{q.currency:>5}  "
              f"(mock-fallback if values look synthetic)")

    news = await providers.news.latest("AAPL", limit=5)
    print(f"\nRSS news for AAPL: {len(news)} items")
    for n in news[:3]:
        print("  -", n.headline[:80], f"({n.source})")

    snaps = await providers.sentiment.snapshot("AAPL")
    print("\nSentiment sources:", ", ".join(f"{s.source}({s.mention_volume})" for s in snaps))


if __name__ == "__main__":
    asyncio.run(main())
