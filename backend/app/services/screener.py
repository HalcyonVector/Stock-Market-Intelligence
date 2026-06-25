"""
Stock screener — filter a universe of symbols by metric thresholds.

Supports: change%, RSI, volume ratio, P/E, market cap, sector.
Uses cached data from movers + fundamentals + technicals.
"""
from __future__ import annotations

import json
from typing import Any

from app.adapters.registry import providers
from app.core.redis import get_redis
from app.services import technicals, fundamentals

# Use the main universe from mock — single source of truth
from app.adapters.mock import _UNIVERSE
DEFAULT_UNIVERSE = _UNIVERSE["US"]


async def screen(filters: dict[str, Any], universe: list[str] | None = None) -> list[dict]:
    """
    Apply filters to universe. Returns matching stocks with metrics.

    Filters:
      change_pct_min/max, rsi_min/max, volume_ratio_min/max,
      pe_min/max, market_cap_min/max, sector
    """
    symbols = universe or DEFAULT_UNIVERSE
    results = []

    for sym in symbols:
        try:
            quote = await providers.market.quote(sym)
            row: dict[str, Any] = {
                "symbol": sym,
                "price": quote.price,
                "change": quote.change,
                "change_pct": quote.change_pct,
                "volume": quote.volume,
                "avg_volume": quote.avg_volume,
                "market_cap": quote.market_cap,
            }

            # Volume ratio
            if quote.volume and quote.avg_volume and quote.avg_volume > 0:
                row["volume_ratio"] = round(quote.volume / quote.avg_volume, 2)
            else:
                row["volume_ratio"] = None

            # Apply change% filter
            if "change_pct_min" in filters and (row["change_pct"] is None or row["change_pct"] < filters["change_pct_min"]):
                continue
            if "change_pct_max" in filters and (row["change_pct"] is None or row["change_pct"] > filters["change_pct_max"]):
                continue

            # Volume ratio filter
            if "volume_ratio_min" in filters and (row["volume_ratio"] is None or row["volume_ratio"] < filters["volume_ratio_min"]):
                continue
            if "volume_ratio_max" in filters and (row["volume_ratio"] is None or row["volume_ratio"] > filters["volume_ratio_max"]):
                continue

            # Market cap filter (in billions)
            if "market_cap_min" in filters:
                if row["market_cap"] is None or row["market_cap"] < filters["market_cap_min"] * 1e9:
                    continue
            if "market_cap_max" in filters:
                if row["market_cap"] is None or row["market_cap"] > filters["market_cap_max"] * 1e9:
                    continue

            # RSI filter — only compute if needed
            if "rsi_min" in filters or "rsi_max" in filters:
                try:
                    tech = await technicals.compute(sym, 60)
                    rsi_val = tech.get("signals", {}).get("rsi", {}).get("value")
                    row["rsi"] = rsi_val
                    if "rsi_min" in filters and (rsi_val is None or rsi_val < filters["rsi_min"]):
                        continue
                    if "rsi_max" in filters and (rsi_val is None or rsi_val > filters["rsi_max"]):
                        continue
                except Exception:
                    row["rsi"] = None
                    continue

            # P/E filter — only compute if needed
            if "pe_min" in filters or "pe_max" in filters or "sector" in filters:
                try:
                    fund = await fundamentals.get_fundamentals(sym)
                    row["pe"] = fund.get("pe_trailing")
                    row["sector"] = fund.get("sector")
                    row["name"] = fund.get("name")

                    if "pe_min" in filters and (row["pe"] is None or row["pe"] < filters["pe_min"]):
                        continue
                    if "pe_max" in filters and (row["pe"] is None or row["pe"] > filters["pe_max"]):
                        continue
                    if "sector" in filters and row["sector"] != filters["sector"]:
                        continue
                except Exception:
                    continue

            results.append(row)
        except Exception:
            continue

    # Sort by absolute change%
    results.sort(key=lambda x: abs(x.get("change_pct", 0) or 0), reverse=True)
    return results
