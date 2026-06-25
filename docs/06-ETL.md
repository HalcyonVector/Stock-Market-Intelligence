# ETL / Data Pipeline Design

## Stages
1. **Extract** — provider adapters pull quotes/candles/news/sentiment. Each
   adapter degrades to mock data on failure, so the pipeline never hard-stops.
2. **Transform** — `scoring/indicators.py` derives `ScoreInputs` (RSI, volatility,
   drawdown, volume ratio, sentiment aggregates); `scoring/engine.py` computes the
   five transparent scores.
3. **Load** — write append-only rows to Postgres time-series tables; update Redis
   latest-value cache; publish `MarketEvent`s for unusual conditions.

## Scheduled tasks (`app/etl/tasks.py` + beat)
| Task | Cadence | Output |
|------|---------|--------|
| `refresh_market` | 30s | price ticks + unusual-activity events |
| `refresh_news` | 5m | deduped `news_articles` |
| `refresh_sentiment` | 10m | `sentiment_events` |
| `recompute_scores` | 15m | `opportunity_scores` + `scores_updated` event |

## Idempotency & dedupe
- News deduped on `UNIQUE(url)`.
- Snapshots are append-only and keyed by `(symbol, ts)`; re-running a window is
  safe (insert-or-ignore semantics at the app layer).

## Unusual-activity detection (example rule)
`abs(change_pct) >= 5%` OR `volume / avg_volume >= 3x` → emit `unusual_activity`
event with severity `high` when `abs(change_pct) >= 8%`. Rules live in code and
are intentionally simple/transparent for MVP; the seam allows ML detectors later.

## Failure handling
- Tasks are `acks_late` → redelivered if a worker dies mid-run.
- Adapter exceptions are caught and logged (`structlog`), then fall back to mock.
- Cache writes are best-effort (never block the response path).

## Backfill
`candles(lookback=N)` + a one-off management job can replay history into
`price_snapshots` to bootstrap back-testing. (Stub for Phase 4.)
