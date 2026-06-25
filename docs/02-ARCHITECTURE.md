# Technical Architecture

## System overview
```
                 ┌────────────────────────────────────────────┐
   Browser ───►  │  Next.js (App Router, RSC + Client islands) │
                 │  TanStack Query · Framer Motion · Recharts  │
                 └───────────────┬───────────────┬────────────┘
                   HTTP /api/*    │   WS /ws/live │ (SSE fallback)
                                  ▼               ▼
                 ┌────────────────────────────────────────────┐
                 │           FastAPI (stateless, N replicas)   │
                 │  routes → services → scoring → adapters     │
                 └───┬───────────┬───────────────┬─────────────┘
            cache/bus│           │ system of record           │ external
                     ▼           ▼                            ▼
                ┌─────────┐ ┌──────────┐            ┌────────────────────┐
                │  Redis  │ │ Postgres │            │ Provider adapters   │
                │ cache + │ │ history+ │            │ yfinance/RSS/Reddit │
                │ pub/sub │ │ entities │            │ Trends · AI (Claude)│
                └────▲────┘ └──────────┘            └────────────────────┘
                     │ publish events
                ┌────┴───────────────────────────────┐
                │ Celery worker + beat (ETL pipeline) │
                └─────────────────────────────────────┘
```

## Why this shape
- **Adapter pattern at the edge** (`app/adapters`): the entire app depends on
  abstract `MarketDataProvider / NewsProvider / SentimentProvider / AIProvider`
  protocols. Swapping mock → yfinance → Polygon, or US → IN, is a config change.
  *Trade-off:* one indirection layer; *benefit:* vendor independence + offline dev.
- **Stateless API + Redis pub/sub bus:** any worker can publish an event; every
  API replica subscribes and fans out to its local WebSockets. Lets us scale the
  API horizontally without sticky sessions. *Alternative:* Kafka (heavier, better
  durability/replay — overkill for an MVP); managed Ably/Pusher (cost, lock-in).
- **Append-only time series in Postgres:** cheap writes, trivial history and
  back-testing. *Alternative:* TimescaleDB hypertables (drop-in upgrade once
  volume grows — noted in schema).
- **Mock-first data layer:** the platform runs with zero API keys, so a solo
  engineer iterates on UX/scoring/pipeline before paying for any feed.

## Request lifecycles
- **Read (e.g. /market/movers):** route → service → Redis cache hit? return :
  adapter fetch → cache (TTL = refresh cadence) → return.
- **Explain (/stocks/{s}/why):** gather quote+candles+news+sentiment → derive
  `ScoreInputs` → compute scores → build evidence-only prompt → AI provider →
  return explanation + evidence + confidence + timeline.
- **Live event:** beat triggers `refresh_market` → worker detects unusual move →
  `publish_event(CH_MARKET_EVENTS)` → API relay → WebSocket → UI animates in.

## Technology choices & rationale
| Layer | Choice | Why | Alternative / trade-off |
|-------|--------|-----|-------------------------|
| Frontend | Next.js + TS | RSC for fast first paint, file routing, Vercel deploy | Remix/SPA — less ecosystem for this stack |
| Data fetch | TanStack Query | polling, cache, retries built-in | SWR (lighter, fewer features) |
| API | FastAPI | async, pydantic validation, OpenAPI free | Django (heavier), Node/Nest (split language) |
| Jobs | Celery + Redis | mature, beat scheduler | Arq/RQ (simpler, fewer features); Dramatiq |
| Cache/bus | Redis | one dependency for cache+pubsub+broker | separate systems = more ops |
| DB | Postgres | relational + JSONB + TimescaleDB path | Mongo (weak for analytics joins) |
| AI | Claude / OpenAI behind adapter | swap models, mock fallback | single-vendor lock-in |
