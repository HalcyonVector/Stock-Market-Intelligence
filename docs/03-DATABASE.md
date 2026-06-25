# Database Design

DDL: [`db/schema.sql`](../db/schema.sql) · ORM: `backend/app/models/entities.py`

## ER diagram
```mermaid
erDiagram
    COMPANIES ||--o{ STOCKS : "issues"
    STOCKS ||--o{ PRICE_SNAPSHOTS : "has"
    STOCKS ||--o{ SENTIMENT_EVENTS : "has"
    STOCKS ||--o{ OPPORTUNITY_SCORES : "scored_by"
    STOCKS ||--o{ NEWS_ARTICLES : "mentioned_in"
    STOCKS ||--o{ MARKET_EVENTS : "emits"
    STOCKS ||--o{ INSIGHT_REPORTS : "explained_by"
    WATCHLISTS ||--o{ WATCHLIST_ITEMS : "contains"

    COMPANIES { int id PK
        string name
        string sector
        string industry }
    STOCKS { int id PK
        string symbol
        string market
        string currency
        float market_cap
        int company_id FK }
    PRICE_SNAPSHOTS { bigint id PK
        string symbol
        timestamptz ts
        float price
        float change_pct
        bigint volume }
    SENTIMENT_EVENTS { bigint id PK
        string symbol
        string source
        timestamptz ts
        int mention_volume
        float sentiment_score }
    OPPORTUNITY_SCORES { bigint id PK
        string symbol
        timestamptz ts
        float opportunity
        float confidence }
    NEWS_ARTICLES { bigint id PK
        string url
        string symbol
        timestamptz published_at }
    MARKET_EVENTS { bigint id PK
        string type
        jsonb payload
        timestamptz ts }
    INSIGHT_REPORTS { bigint id PK
        string kind
        text content
        jsonb evidence
        float confidence }
    WATCHLISTS { int id PK string user_id }
    WATCHLIST_ITEMS { int id PK int watchlist_id FK string symbol }
```

## Entity rationale
| Entity | Purpose | Notes |
|--------|---------|-------|
| companies / stocks | Reference data; a company may list in multiple markets | `UNIQUE(symbol, market)` |
| price_snapshots | Append-only price/volume series | drives candles, momentum, history |
| news_articles | Deduped headlines | `UNIQUE(url)` prevents re-ingest |
| sentiment_events | Per-source social metrics over time | source ∈ reddit/twitter/trends |
| sector_snapshots | Aggregated sector momentum/flow | powers rotation dashboard |
| opportunity_scores | Materialised score history | back-testable, audit trail |
| market_events | Unusual activity / earnings / breaking | also streamed via Redis |
| insight_reports | AI outputs WITH evidence + confidence | traceability requirement |
| watchlists / items | User-curated symbols | stub `user_id` until auth |

## Indexing strategy
- Every time series carries a composite `(symbol, ts DESC)` index → O(log n)
  "latest value" and range scans, the two access patterns we actually issue.
- `opportunity_scores` additionally indexes `(ts DESC, opportunity DESC)` so the
  homepage "top opportunities right now" is an index-only top-N.
- `news_articles(published_at DESC)` for the global news rail; `UNIQUE(url)` for
  idempotent ingestion.
- `market_events(ts DESC)`, `(type)`, `(symbol)` for the activity feed filters.

## Hot vs cold reads
Latest values are served from **Redis** (TTL = refresh cadence); Postgres is the
system of record for history, analytics and back-testing. This keeps p99 read
latency low and protects the DB from dashboard polling storms.

## Scaling path
1. Partition / hypertable the four `*_snapshots`/`*_events` tables by month
   (`SELECT create_hypertable('price_snapshots','ts')`).
2. Add continuous aggregates for sector/score rollups.
3. Move cold partitions to cheaper storage; retain ~13 months hot.
