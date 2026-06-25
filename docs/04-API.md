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
| GET | `/stocks/{symbol}` | Profile + quote + news |
| GET | `/stocks/{symbol}/why` | **Flagship** explanation + evidence + confidence |
| GET | `/stocks/{symbol}/sentiment` | Per-source + aggregate sentiment |
| GET | `/sectors/rotation?market=` | Sector momentum + net flow |
| GET | `/sentiment/trending?market=` | Attention-ranked tickers |
| GET | `/insights/briefing?market=` | AI daily market briefing |
| GET | `/health` | Liveness + data/AI mode + redis |

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

## Example — `GET /stocks/NVDA/why`
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
| POST | `/auth/token` | Issue a JWT for a `user_id` (dev/passwordless; swap for Supabase/OAuth in prod) |
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

Ownership is enforced on every read/mutation (non-owners get `404`). Symbols are
normalised to upper-case; duplicates are ignored.

## Live data mode
Set `DATA_MODE=live` to use free providers (yfinance global incl. NSE `.NS`, RSS
news, Reddit, Google Trends). Each source **degrades to mock** if its key/dep is
missing. Validate coverage on a networked machine:
`cd backend && DATA_MODE=live python -m scripts.validate_live`.
