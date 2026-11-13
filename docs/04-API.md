# API Design

Base prefix `/api/v1`. Interactive docs at `/docs` (OpenAPI auto-generated).
All payloads wrap data as `{ "data": ... }`; insight endpoints add a `disclaimer`.

## REST endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/market/quote/{symbol}` | Latest quote (cached ~30s) |
| GET | `/market/movers?market=` | Gainers / losers / most active |
| GET | `/market/candles/{symbol}?interval=1d&lookback=90` | OHLCV series |
| GET | `/discovery?market=` | Full ranked discovery scan |
| GET | `/discovery/buckets?market=` | Momentum / breakout / surge / top buckets |
| GET | `/stocks/search?q=` | Find any US / NSE / BSE stock (tracked list, then Finnhub) |
| GET | `/stocks/{symbol}` | Profile + quote + news. Quotes carry `source`: `live`, `eod` (last daily close) or `mock` (sample data) |
| GET | `/stocks/{symbol}/why` | **Flagship** explanation + evidence + confidence |
| GET | `/stocks/{symbol}/sentiment` | Per-source + aggregate sentiment |
| GET | `/sectors/rotation?market=` | Sector momentum + net flow |
| GET | `/sentiment/trending?market=` | Attention-ranked tickers |
| GET | `/insights/briefing?market=` | AI daily market briefing |
| GET | `/insights/study` | Market Study statistics (recomputed weekly) |
| GET | `/insights/analyst-ratings` | Analyst consensus for tracked US stocks (Finnhub recommendation trends) |
| GET | `/insights/events?symbols=A,B&days=90` | Upcoming earnings / ex-dividend / dividend dates (synced daily) |
| GET | `/health` | Liveness + data/AI mode + redis; `market.mock_recent` is true while sample data is being served |

## Realtime
| Transport | Path | Notes |
|-----------|------|-------|
| WebSocket | `/api/v1/ws/live` | Primary live channel |
| SSE | `/api/v1/sse/live` | Fallback where WS is blocked |

Event envelope: `{ "channel": "events:market", "data": { "type": "unusual_activity", "symbol": "...", "change_pct": 8.4, "severity": "high", "ts": "..." } }`

## Conventions & rationale
- **Thin wrapper envelope** keeps room to add `meta`/pagination without breaking
  clients. *Trade-off:* one nesting level.
- **Query-param `market`** (US/IN/GLOBAL) instead of separate routes → market is
  data, not API surface; supports the GLOBAL multi-exchange requirement.
- **GET-only MVP** (reads). Watchlist mutations (POST/DELETE) land in Phase 3 with
  auth; documented here as the next surface.
- **Caching at service layer**, not HTTP, so WebSocket pushes and REST share one
  source of truth in Redis.

## Example: `GET /stocks/NVDA/why`
```json
{ "data": {
  "symbol": "NVDA",
  "explanation": "NVDA rose 8.7% on above-average volume (3.1x) ...",
  "confidence": 0.85,
  "supporting_signals": { "quote": {...}, "volume_ratio": 3.1, "news": [...],
    "sentiment": {...}, "scores": {...} },
  "timeline": [ {"ts":"...","type":"news","label":"..."} ],
  "scores": { "opportunity": {"value": 78, "formula":"...","weights":{...}} },
  "disclaimer": "Educational use only. Not investment advice." } }
```

## Auth (Phase 3)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/anon` | Mint a random anonymous user id + JWT (one per browser; no accounts) |
| GET | `/auth/me` | Return the authenticated user |

**Auth model:** endpoints accept `Authorization: Bearer <JWT>`. If `AUTH_SECRET`
is unset (dev), requests fall back to an `X-User-Id` header or the `demo` user, so
the SPA works with zero setup. Set `AUTH_SECRET` in production to require tokens.

## Watchlists (Phase 3, persisted, per-user)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/watchlists` | List the caller's watchlists |
| POST | `/watchlists` | Create a watchlist `{name}` |
| DELETE | `/watchlists/{id}` | Delete (owner only) |
| GET | `/watchlists/{id}` | Watchlist **enriched with live quotes** |
| POST | `/watchlists/{id}/items` | Add `{symbol}` (auto-uppercased, deduped) |
| DELETE | `/watchlists/{id}/items/{symbol}` | Remove a symbol |
| GET | `/watchlists/{id}/digest` | Five-day move per stock + AI recap (cached per list per day) |

## Alerts, push and paper trading (per browser identity)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/alerts` | List / create price alerts |
| GET | `/alerts/push` | Whether Web Push is configured, its public VAPID key, device count |
| POST | `/alerts/push` | Register this browser's push subscription |
| POST | `/alerts/push/unsubscribe` | Remove it `{endpoint}` |
| POST | `/alerts/push/test` | Send a test notification to this identity's devices |
| GET | `/paper` | Paper account, positions, recent orders |
| POST | `/paper/orders` | Practice buy/sell (refused when only sample prices are available) |
| GET | `/paper/history` | Daily account value per currency vs. SPY / Nifty 50 |

Ownership is enforced on every read/mutation (non-owners get `404`). Symbols are
normalised to upper-case; duplicates are ignored.

## Live data mode
Set `DATA_MODE=live` to use free providers (yfinance global incl. NSE `.NS`, RSS
news, Reddit, Google Trends). Each source **degrades to mock** if its key/dep is
missing. Validate coverage on a networked machine:
`cd backend && DATA_MODE=live python -m scripts.validate_live`.
