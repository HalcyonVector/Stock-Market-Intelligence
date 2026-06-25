-- ============================================================================
-- Stock Discovery & Intelligence — PostgreSQL schema
-- ----------------------------------------------------------------------------
-- Design notes
--  * Reference tables (companies, stocks, watchlists) are small & mutable.
--  * *_snapshots / *_events are APPEND-ONLY time series. We never UPDATE them;
--    we insert and query by (symbol, ts). This keeps writes cheap and makes
--    historical tracking + back-testing trivial.
--  * Hot "latest value" reads are served from Redis; Postgres is the system of
--    record and powers range/history queries and analytics.
--  * If volume grows, the time-series tables are natural candidates for
--    TimescaleDB hypertables or monthly partitioning (see docs/DATABASE.md).
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(256) NOT NULL,
    sector       VARCHAR(64)  NOT NULL,
    industry     VARCHAR(128) DEFAULT '',
    description  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_companies_sector ON companies (sector);
CREATE INDEX IF NOT EXISTS ix_companies_name   ON companies (name);

CREATE TABLE IF NOT EXISTS stocks (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(32) NOT NULL,
    market      VARCHAR(8)  NOT NULL,           -- US / IN / GLOBAL
    currency    VARCHAR(8)  DEFAULT 'USD',
    market_cap  DOUBLE PRECISION,
    is_active   BOOLEAN DEFAULT TRUE,
    company_id  INTEGER REFERENCES companies(id),
    CONSTRAINT uq_symbol_market UNIQUE (symbol, market)
);
CREATE INDEX IF NOT EXISTS ix_stocks_symbol ON stocks (symbol);
CREATE INDEX IF NOT EXISTS ix_stocks_market ON stocks (market);

-- --- Time series: prices ---------------------------------------------------
CREATE TABLE IF NOT EXISTS price_snapshots (
    id          BIGSERIAL PRIMARY KEY,
    symbol      VARCHAR(32) NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    change_pct  DOUBLE PRECISION NOT NULL,
    volume      BIGINT NOT NULL,
    avg_volume  BIGINT NOT NULL
);
-- Covers "latest price for symbol" and "price range over window".
CREATE INDEX IF NOT EXISTS ix_price_symbol_ts ON price_snapshots (symbol, ts DESC);

-- --- News ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_articles (
    id            BIGSERIAL PRIMARY KEY,
    symbol        VARCHAR(32),                  -- NULL = market-wide
    headline      TEXT NOT NULL,
    url           TEXT NOT NULL,
    source        VARCHAR(128) NOT NULL,
    summary       TEXT DEFAULT '',
    published_at  TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_news_url UNIQUE (url)          -- dedupe on ingest
);
CREATE INDEX IF NOT EXISTS ix_news_symbol     ON news_articles (symbol);
CREATE INDEX IF NOT EXISTS ix_news_published  ON news_articles (published_at DESC);

-- --- Time series: sentiment ------------------------------------------------
CREATE TABLE IF NOT EXISTS sentiment_events (
    id              BIGSERIAL PRIMARY KEY,
    symbol          VARCHAR(32) NOT NULL,
    source          VARCHAR(32) NOT NULL,        -- reddit / twitter / trends
    ts              TIMESTAMPTZ NOT NULL,
    mention_volume  INTEGER NOT NULL,
    sentiment_score DOUBLE PRECISION NOT NULL,   -- -1..1
    attention_score DOUBLE PRECISION NOT NULL,   -- 0..100
    growth_rate     DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sentiment_symbol_ts ON sentiment_events (symbol, ts DESC);

-- --- Time series: sector snapshots -----------------------------------------
CREATE TABLE IF NOT EXISTS sector_snapshots (
    id        BIGSERIAL PRIMARY KEY,
    sector    VARCHAR(64) NOT NULL,
    market    VARCHAR(8)  NOT NULL,
    ts        TIMESTAMPTZ NOT NULL,
    momentum  DOUBLE PRECISION NOT NULL,
    net_flow  DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sector_ts ON sector_snapshots (sector, ts DESC);

-- --- Time series: opportunity scores ---------------------------------------
CREATE TABLE IF NOT EXISTS opportunity_scores (
    id          BIGSERIAL PRIMARY KEY,
    symbol      VARCHAR(32) NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,
    opportunity DOUBLE PRECISION NOT NULL,
    momentum    DOUBLE PRECISION NOT NULL,
    sentiment   DOUBLE PRECISION NOT NULL,
    risk        DOUBLE PRECISION NOT NULL,
    attention   DOUBLE PRECISION NOT NULL,
    confidence  DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_opp_symbol_ts ON opportunity_scores (symbol, ts DESC);
-- Powers the homepage "top opportunities right now" ranking.
CREATE INDEX IF NOT EXISTS ix_opp_ts_score  ON opportunity_scores (ts DESC, opportunity DESC);

-- --- Live market events (also streamed via Redis pub/sub) ------------------
CREATE TABLE IF NOT EXISTS market_events (
    id        BIGSERIAL PRIMARY KEY,
    symbol    VARCHAR(32),
    type      VARCHAR(48) NOT NULL,             -- unusual_activity / earnings / news ...
    severity  VARCHAR(16) DEFAULT 'low',
    payload   JSONB NOT NULL,
    ts        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_ts    ON market_events (ts DESC);
CREATE INDEX IF NOT EXISTS ix_events_type  ON market_events (type);
CREATE INDEX IF NOT EXISTS ix_events_sym   ON market_events (symbol);

-- --- AI insight reports (traceable, evidence attached) ---------------------
CREATE TABLE IF NOT EXISTS insight_reports (
    id          BIGSERIAL PRIMARY KEY,
    symbol      VARCHAR(32),
    kind        VARCHAR(32) NOT NULL,            -- explanation / briefing / weekly
    content     TEXT NOT NULL,
    evidence    JSONB DEFAULT '{}',
    confidence  DOUBLE PRECISION DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_insight_symbol ON insight_reports (symbol);
CREATE INDEX IF NOT EXISTS ix_insight_kind   ON insight_reports (kind, created_at DESC);

-- --- Watchlists ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlists (
    id       SERIAL PRIMARY KEY,
    user_id  VARCHAR(64) NOT NULL,
    name     VARCHAR(128) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_watchlists_user ON watchlists (user_id);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id            SERIAL PRIMARY KEY,
    watchlist_id  INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol        VARCHAR(32) NOT NULL,
    CONSTRAINT uq_wl_symbol UNIQUE (watchlist_id, symbol)
);

-- ============================================================================
-- Optional: convert time-series tables to TimescaleDB hypertables
--   SELECT create_hypertable('price_snapshots','ts');
--   SELECT create_hypertable('sentiment_events','ts');
-- ============================================================================
