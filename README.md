# 📈 Stock Discovery & Intelligence — AI-Powered Market Intelligence Platform

A full-stack market intelligence platform that surfaces emerging stocks, explains *why* they're moving (with cited evidence and confidence scores), optimizes portfolios via mean-variance optimization, backtests trading strategies, forecasts prices with ML ensembles, and includes a zero-loss Safe Investment Guide for beginners. Built with Next.js, FastAPI, Ollama, and Docker.

> **Educational and informational use only. Not personalized investment advice.**
> No brokerage credentials are stored, no trades are executed.

---

## 🎯 Features

### Core Intelligence

- **AI Dashboard** — Real-time market overview with fear/greed gauge, sector rotation heatmap, volume leaders, opportunity radar, and Ollama-powered AI briefings
- **"Why Is This Stock Moving?"** — Flagship AI-generated explanations with confidence scores, cited signals, and event timelines for any ticker
- **AI Deep Research** — Comprehensive stock analysis combining technicals, fundamentals, sentiment, and news into a single research report via Ollama (qwen2.5:14b)
- **Command Palette** — Global `Cmd-K` / `Ctrl-K` search across all tickers and pages

### Portfolio & Optimization

- **Portfolio Optimizer** — Mean-variance optimization (scipy SLSQP), 15,000-point Monte Carlo cloud, optimizer-traced efficient frontier, 5 allocation strategies
- **Monte Carlo Simulation** — 2,000-path Student-t fat-tail growth simulation with percentile bands
- **Stress Testing** — 6 historical crash scenarios (2008 GFC, COVID, Dot-com, etc.) applied to your portfolio
- **Correlation Heatmap** — Pairwise asset correlation matrix for diversification analysis
- **Portfolio Rebalancer** — Drift detection, equal/custom weight strategies, trade suggestions with turnover calculation
- **Strategy Backtester** — Test RSI, MACD, SMA, Bollinger strategies with equity curves, trade logs, Sharpe ratio, max drawdown, and alpha

### Analysis Tools

- **Technical Indicators** — RSI, MACD, Bollinger Bands, Stochastic, ATR, OBV with interactive multi-timeframe charts
- **Fundamental Analysis** — P/E, P/B, EPS, dividend yield, market cap, revenue, and margins from yfinance
- **ML Price Forecast** — Ensemble model (linear regression + Holt exponential smoothing) with 80%/95% confidence intervals
- **Smart Screener** — Filter 50+ stocks by change%, RSI, volume ratio, P/E, market cap with preset strategy filters
- **Market Heatmap** — Treemap visualization of sector/stock performance with color-coded returns
- **Stock Comparison** — Side-by-side analysis of up to 6 stocks: normalized price overlay, technicals, and fundamentals

### Market Data

- **Sector Rotation Tracker** — Relative sector performance with rotation signals
- **Retail Sentiment** — Reddit/Google Trends sentiment aggregation with trending tickers
- **Earnings Calendar** — Upcoming earnings dates with estimate vs. actual tracking
- **Economic Calendar** — Key economic events (CPI, Fed, GDP, jobs) with impact ratings
- **Real-time Price Alerts** — Redis-backed alerts with 4 condition types (above/below/change % above/below), auto-check every 30s
- **Watchlists** — Per-user watchlists with live quote enrichment via WebSocket

### Safe Investment Guide (India + US)

- **16 Indian Instruments** — PPF, FD, RD, NSC, KVP, Post Office MIS, Post Office TD, SCSS, SSY, Liquid Fund, Debt Fund, SGB, NPS, ELSS, Index Fund
- **6 US Instruments** — HYSA, Treasury, Money Market, Bond ETF, CD, S&P 500 ETF
- **SIP Calculator** — Compound interest with annual step-up, preset budgets (Student ₹1K, Starter ₹5K, etc.)
- **Goal Planner** — Reverse SIP: how much monthly for a target (Emergency Fund, Bike, House, Education)
- **Allocation Builder** — Multi-instrument combined returns with blended rate, risk tracking, guaranteed portion %, pie chart, growth projections
- **AI Advisor** — Ollama-powered Q&A for personalized (educational) investment guidance
- **4 Risk Profiles** — Ultra Safe, Conservative, Balanced Safe, Growth with preset allocations

### UI/UX

- **Animated Landing Page** — Particle field, glowing orbs, gradient text, scroll-reveal feature cards, animated counters, Framer Motion throughout
- **Dark-first Terminal Aesthetic** — Red/black gradient identity (Perplexity x Linear x Bloomberg)
- **Glass-morphism Cards** — Backdrop blur, subtle borders, glow-on-hover across all components
- **Scrolling Ticker Tape** — Live stock ticker marquee across the top
- **Collapsible Sidebar** — 10-page navigation with active state indicators and glow effects

---

## 🛠️ Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend Framework** | Next.js 14 + React 18 | App Router, server/client components, TypeScript |
| **State Management** | TanStack React Query 5 | Caching, refetching, stale-while-revalidate |
| **Charts** | Recharts 2 | Area, Line, Bar, Pie, Scatter, Treemap, Radar |
| **Animations** | Framer Motion 11 | Page transitions, scroll reveals, layout animations |
| **Icons** | Lucide React | 30+ icons across the UI |
| **Styling** | Tailwind CSS 3 | Custom dark theme with crimson/ink/ember palettes |
| **Backend Framework** | FastAPI | Async Python, auto-generated OpenAPI docs at `/docs` |
| **ORM** | SQLAlchemy 2 (async) | AsyncPG driver, Alembic migrations |
| **Task Queue** | Celery 5 | Worker + Beat scheduler for ETL pipelines (30s/5m/10m/15m) |
| **AI Provider** | Ollama (qwen2.5:14b) | Local LLM via OpenAI-compatible API, zero API cost |
| **Market Data** | yfinance | Global stock data, no API key required |
| **News/Sentiment** | RSS + Reddit (PRAW) + Google Trends | Free-tier data sources with fallback to mock |
| **Database** | PostgreSQL 16 | Persistent storage for watchlists, alerts, history |
| **Cache/PubSub** | Redis 7 | Price caching, alert storage, real-time event relay |
| **Portfolio Math** | NumPy + SciPy | SLSQP optimizer, covariance matrices, Monte Carlo |
| **Data Processing** | Pandas + Polars | Market data wrangling and indicator computation |
| **Containerization** | Docker Compose | 6-service stack: postgres, redis, api, worker, beat, web |
| **Auth** | JWT (HS256) | Token-based auth with demo user fallback |

---

## 📋 Prerequisites

- **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/) (recommended)
- **Node.js 18+** — [Download here](https://nodejs.org/) (for local frontend dev)
- **Python 3.12+** — [Download here](https://python.org/) (for local backend dev)
- **Ollama** — [Download here](https://ollama.ai/) (for AI features)

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended — One Command)

```bash
docker compose -f infra/docker-compose.yml up --build
```

| Service | URL |
|---------|-----|
| **Web UI** | http://localhost:9000 |
| **API Docs** | http://localhost:8000/docs |
| **PostgreSQL** | localhost:5432 |
| **Redis** | localhost:6379 |

Runs in **mock mode** by default — zero API keys, deterministic offline data, full UI + pipeline + scoring working immediately.

### Option 2: Run Locally (No Docker)

#### Backend

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### Ollama (for AI features)

```bash
ollama pull qwen2.5:14b
ollama serve   # runs on port 11434
```

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **API Docs** | http://localhost:8000/docs |
| **Ollama** | http://localhost:11434 |

---

## 📖 How to Use the App

| Page | Route | What It Does |
|------|-------|-------------|
| **Landing** | `/` | Animated intro with feature showcase, click "Launch Dashboard" to enter |
| **Dashboard** | `/` | AI briefing, opportunity radar, live movers, sector heatmap, sentiment, volume leaders |
| **Portfolio** | `/portfolio` | Build a portfolio, run optimization, view frontier/Monte Carlo/stress tests, rebalance |
| **Research** | `/research` | AI-powered deep research reports per stock |
| **Watchlists** | `/watchlists` | Create/manage personal watchlists with live quotes |
| **Screener** | `/screener` | Filter stocks by technical/fundamental criteria |
| **Heatmap** | `/heatmap` | Treemap of market sectors and individual stock performance |
| **Compare** | `/compare` | Side-by-side comparison of up to 6 stocks |
| **Backtest** | `/backtest` | Test RSI/MACD/SMA/Bollinger strategies against historical data |
| **Alerts** | `/alerts` | Set price alerts with 4 condition types, auto-checks every 30s |
| **Safe Invest** | `/invest` | Zero-loss instruments, SIP calculator, goal planner, allocation builder, AI advisor |
| **Stock Detail** | `/stock/[SYMBOL]` | "Why is this moving?", technicals, fundamentals, forecast, deep research |

Use **Cmd-K / Ctrl-K** anywhere to open the command palette and search for any ticker.

---

## 📁 Project Structure

```
stock-discovery-intelligence/
├── README.md                           # This file
├── infra/
│   └── docker-compose.yml              # 6-service Docker stack
├── db/
│   ├── schema.sql                      # PostgreSQL schema
│   ├── seed.sql                        # Seed data
│   └── migrations/                     # Alembic migrations
│
├── backend/
│   ├── Dockerfile                      # Python 3.12-slim image
│   ├── requirements.txt                # 20 Python dependencies
│   ├── .env.example                    # Environment variable template
│   ├── app/
│   │   ├── main.py                     # FastAPI app, lifespan, CORS, router registration
│   │   ├── core/
│   │   │   ├── config.py               # Pydantic Settings (DB, Redis, Ollama, CORS)
│   │   │   ├── redis.py                # Redis client + pub/sub channels
│   │   │   ├── security.py             # JWT encode/decode
│   │   │   └── logging.py              # Structured logging
│   │   ├── api/routes/                  # 15 route modules
│   │   │   ├── market.py               # /quote, /movers, /candles, /heatmap
│   │   │   ├── stocks.py               # /overview, /why, /technicals, /fundamentals, /research, /forecast
│   │   │   ├── portfolio.py            # /analyze, /saved, /rebalance
│   │   │   ├── insights.py             # /briefing, /news, /earnings, /economic-calendar
│   │   │   ├── invest.py               # /instruments, /profiles, /sip, /goal, /allocate, /advise
│   │   │   ├── alerts.py               # CRUD + /check
│   │   │   ├── backtest.py             # /strategies, POST /backtest
│   │   │   ├── screener.py             # GET with filter params
│   │   │   ├── discovery.py            # /discovery, /buckets
│   │   │   ├── sentiment.py            # /trending
│   │   │   ├── sectors.py              # /rotation
│   │   │   ├── watchlists.py           # CRUD + items
│   │   │   ├── auth.py                 # /token, /me
│   │   │   ├── realtime.py             # WebSocket /ws/live
│   │   │   └── health.py               # /health
│   │   ├── services/                   # 18 service modules
│   │   │   ├── portfolio.py            # Mean-variance optimization, Monte Carlo, stress testing
│   │   │   ├── safe_invest.py          # 22 instruments, SIP calc, goal planner, allocation engine
│   │   │   ├── backtester.py           # RSI/MACD/SMA/Bollinger strategy engine
│   │   │   ├── forecast.py             # Linear regression + Holt exponential smoothing ensemble
│   │   │   ├── deep_research.py        # Ollama-powered comprehensive stock research
│   │   │   ├── technicals.py           # RSI, MACD, Bollinger, Stochastic, ATR, OBV
│   │   │   ├── fundamentals.py         # P/E, P/B, EPS, dividends, revenue from yfinance
│   │   │   ├── rebalance.py            # Drift detection, trade suggestions
│   │   │   ├── alerts.py               # Redis-backed price alert engine
│   │   │   ├── screener.py             # Multi-criteria stock filtering
│   │   │   ├── briefing.py             # Daily AI market briefing
│   │   │   ├── explain.py              # "Why is this stock moving?"
│   │   │   ├── heatmap.py              # Sector/stock treemap data
│   │   │   ├── market.py               # Quote/candle data via yfinance
│   │   │   ├── discovery.py            # Stock discovery scoring
│   │   │   ├── sentiment.py            # Reddit + Trends sentiment
│   │   │   ├── sector.py               # Sector rotation tracking
│   │   │   └── watchlist.py            # Watchlist CRUD
│   │   ├── adapters/                   # Data source abstraction
│   │   │   ├── base.py                 # Abstract adapter interface
│   │   │   ├── live.py                 # yfinance + RSS + Reddit + Trends
│   │   │   ├── mock.py                 # Deterministic offline data
│   │   │   ├── ai.py                   # Ollama (OpenAI-compat) + Anthropic providers
│   │   │   ├── sentiment_live.py       # Reddit + Google Trends adapter
│   │   │   └── registry.py             # Adapter selection by config
│   │   ├── scoring/                    # Discovery scoring engine
│   │   │   ├── engine.py               # Composite scoring pipeline
│   │   │   └── indicators.py           # Technical indicator calculations
│   │   ├── etl/                        # Background jobs
│   │   │   ├── celery_app.py           # Celery + Beat configuration
│   │   │   └── tasks.py               # 4 tasks: market, news, sentiment, scores (30s–15m)
│   │   ├── models/entities.py          # SQLAlchemy ORM models
│   │   ├── schemas/                    # Pydantic request/response models
│   │   ├── db/session.py               # Async engine + session factory
│   │   └── realtime/manager.py         # WebSocket connection manager + Redis relay
│   ├── scripts/validate_live.py        # Live adapter smoke test
│   └── tests/                          # 4 test modules (API, auth, scoring, watchlists)
│
├── frontend/
│   ├── Dockerfile                      # Multi-stage Node 20 Alpine build
│   ├── package.json                    # 8 runtime + 9 dev dependencies
│   ├── tailwind.config.ts              # Custom crimson/ink/ember/base color palette
│   ├── tsconfig.json                   # TypeScript strict config
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx              # Root layout with ShellLayout wrapper
│   │   │   ├── page.tsx                # Landing page overlay → Dashboard
│   │   │   ├── portfolio/page.tsx      # Portfolio optimizer (1011 lines)
│   │   │   ├── invest/page.tsx         # Safe Investment Guide (1011 lines)
│   │   │   ├── alerts/page.tsx         # Price alerts CRUD
│   │   │   ├── backtest/page.tsx       # Strategy backtester
│   │   │   ├── compare/page.tsx        # Stock comparison
│   │   │   ├── heatmap/page.tsx        # Market heatmap
│   │   │   ├── research/page.tsx       # AI research reports
│   │   │   ├── screener/page.tsx       # Stock screener
│   │   │   ├── watchlists/page.tsx     # Watchlist management
│   │   │   └── stock/[symbol]/page.tsx # Dynamic stock detail
│   │   ├── components/
│   │   │   ├── landing/
│   │   │   │   └── LandingPage.tsx     # Animated landing (particles, counters, feature cards)
│   │   │   ├── dashboard/              # 12 dashboard widgets
│   │   │   │   ├── Dashboard.tsx       # Main dashboard layout
│   │   │   │   ├── FearGreedGauge.tsx  # Fear/greed semicircle gauge
│   │   │   │   ├── MarketOverview.tsx  # Stats bar with sparklines
│   │   │   │   ├── MarketBriefing.tsx  # AI-generated daily briefing
│   │   │   │   ├── OpportunityRadar.tsx # Scored stock opportunities
│   │   │   │   ├── MoversList.tsx      # Top gainers/losers
│   │   │   │   ├── SectorHeatmap.tsx   # Sector performance grid
│   │   │   │   ├── SentimentTrends.tsx # Retail sentiment chart
│   │   │   │   ├── VolumeLeaders.tsx   # Unusual volume stocks
│   │   │   │   ├── NewsCarousel.tsx    # Scrolling news feed
│   │   │   │   ├── EarningsCalendar.tsx # Upcoming earnings
│   │   │   │   ├── EconomicCalendar.tsx # Economic events
│   │   │   │   └── LiveFeed.tsx        # Real-time activity feed
│   │   │   ├── portfolio/              # 10 portfolio components
│   │   │   │   ├── PortfolioBuilder.tsx # Symbol selector + analyze button
│   │   │   │   ├── EfficientFrontier.tsx # Scatter plot frontier
│   │   │   │   ├── MonteCarloChart.tsx  # Growth simulation fan
│   │   │   │   ├── RiskProfiles.tsx     # Risk/return profiles
│   │   │   │   ├── StrategyComparison.tsx # Strategy bar chart
│   │   │   │   ├── CorrelationHeatmap.tsx # Correlation matrix
│   │   │   │   ├── StressTest.tsx       # Crash scenario analysis
│   │   │   │   ├── BacktestChart.tsx    # Strategy equity curves
│   │   │   │   ├── AssetTable.tsx       # Detailed asset grid
│   │   │   │   └── Rebalancer.tsx       # Drift + trade suggestions
│   │   │   ├── stock/                  # 7 stock detail components
│   │   │   │   ├── StockIntelligence.tsx # Main stock page layout
│   │   │   │   ├── WhyMovingCard.tsx    # AI "why" explanation
│   │   │   │   ├── PriceChart.tsx       # Interactive candlestick/line chart
│   │   │   │   ├── TechnicalIndicators.tsx # RSI, MACD, Bollinger panels
│   │   │   │   ├── FundamentalsCard.tsx # Key financial metrics
│   │   │   │   ├── PriceForecast.tsx    # ML prediction chart
│   │   │   │   └── DeepResearch.tsx     # Full AI research report
│   │   │   ├── layout/                 # Shell components
│   │   │   │   ├── ShellLayout.tsx     # Sidebar + ticker + main wrapper
│   │   │   │   ├── Sidebar.tsx         # Collapsible 10-page nav
│   │   │   │   ├── TickerTape.tsx      # Scrolling stock marquee
│   │   │   │   └── TopBar.tsx          # (Legacy) top bar
│   │   │   └── ui/                     # Shared UI primitives
│   │   │       ├── BentoCard.tsx       # Glass-morphism card wrapper
│   │   │       ├── CommandPalette.tsx   # Cmd-K search modal
│   │   │       ├── ScorePill.tsx       # Color-coded score badge
│   │   │       └── Sparkline.tsx       # Inline mini chart
│   │   ├── hooks/useLiveFeed.ts        # WebSocket hook for real-time events
│   │   ├── lib/
│   │   │   ├── api.ts                  # API client (40+ methods)
│   │   │   ├── providers.tsx           # React Query provider
│   │   │   └── utils.ts               # cn(), pct(), scoreColor(), changeColor()
│   │   └── styles/globals.css          # Tailwind directives, glass utilities, animations
│
└── docs/                               # 17 documentation files
    ├── GETTING-STARTED.md
    ├── 01-PRD.md                       # Product Requirements Document
    ├── 02-ARCHITECTURE.md              # System architecture
    ├── 03-DATABASE.md                  # Schema documentation
    ├── 04-API.md                       # API reference
    ├── 05-STREAMING.md                 # WebSocket/real-time docs
    ├── 06-ETL.md                       # Background job pipeline
    ├── 07-FOLDER-STRUCTURE.md          # Codebase organization
    ├── 08-SCORING.md                   # Discovery scoring algorithm
    ├── 09-DESIGN-SYSTEM.md             # UI/UX design tokens
    ├── 10-WIREFRAMES.md                # Page wireframes
    ├── 11-COMPONENTS.md                # Component library docs
    ├── 12-TESTING.md                   # Test strategy
    ├── 13-DEPLOYMENT.md                # Deployment guide
    ├── 14-MONITORING.md                # Observability
    ├── 15-RISK.md                      # Risk assessment
    └── 16-ROADMAP.md                   # Feature roadmap
```

---

## 🔌 API Endpoints (15 Route Modules, 40+ Endpoints)

### Market Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/market/quote/{symbol}` | Real-time quote for a ticker |
| GET | `/api/v1/market/movers` | Top gainers, losers, most active |
| GET | `/api/v1/market/candles/{symbol}` | OHLCV candles (interval, lookback params) |
| GET | `/api/v1/market/heatmap` | Sector treemap data |

### Stock Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stocks/{symbol}` | Full stock overview |
| GET | `/api/v1/stocks/{symbol}/why` | AI "why is this moving?" explanation |
| GET | `/api/v1/stocks/{symbol}/technicals` | RSI, MACD, Bollinger, Stochastic, ATR, OBV |
| GET | `/api/v1/stocks/{symbol}/fundamentals` | P/E, P/B, EPS, revenue, margins |
| GET | `/api/v1/stocks/{symbol}/research` | AI deep research report |
| GET | `/api/v1/stocks/{symbol}/forecast` | ML price prediction (30-day default) |

### Portfolio

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/portfolio/analyze` | Full optimization (frontier, Monte Carlo, stress tests) |
| GET | `/api/v1/portfolio/saved` | List saved portfolios |
| POST | `/api/v1/portfolio/saved` | Save a portfolio |
| DELETE | `/api/v1/portfolio/saved/{name}` | Delete a saved portfolio |
| POST | `/api/v1/portfolio/rebalance` | Calculate rebalancing trades |

### Safe Investment Guide

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/invest/instruments` | List instruments by country (IN/US) |
| GET | `/api/v1/invest/profiles` | Risk profiles with preset allocations |
| GET | `/api/v1/invest/sip` | SIP calculator (monthly, rate, years, step_up) |
| GET | `/api/v1/invest/goal` | Goal planner (target, years, rate) |
| POST | `/api/v1/invest/allocate` | Multi-instrument allocation projection |
| POST | `/api/v1/invest/advise` | AI advisor Q&A |

### Alerts, Screener, Backtest

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/alerts` | List active alerts |
| POST | `/api/v1/alerts` | Create a price alert |
| DELETE | `/api/v1/alerts/{id}` | Delete an alert |
| GET | `/api/v1/alerts/check` | Check all alerts against live prices |
| GET | `/api/v1/screener` | Filter stocks by criteria |
| GET | `/api/v1/backtest/strategies` | List available strategies |
| POST | `/api/v1/backtest` | Run a strategy backtest |

### Insights & Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/insights/briefing` | AI-generated daily market briefing |
| GET | `/api/v1/insights/news` | Latest market news (RSS) |
| GET | `/api/v1/insights/earnings` | Upcoming earnings calendar |
| GET | `/api/v1/insights/economic-calendar` | Economic events |
| GET | `/api/v1/discovery` | Scored stock discovery list |
| GET | `/api/v1/sentiment/trending` | Trending tickers by sentiment |
| GET | `/api/v1/sectors/rotation` | Sector rotation data |

### Auth & Watchlists

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/token` | Get JWT token |
| GET | `/api/v1/auth/me` | Current user info |
| GET/POST/DELETE | `/api/v1/watchlists` | Watchlist CRUD |
| POST/DELETE | `/api/v1/watchlists/{id}/items` | Add/remove symbols |
| WS | `/api/v1/ws/live` | Real-time price + event stream |

---

## ⚙️ Configuration

All config is in `backend/.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_MODE` | `mock` | `mock` for offline data, `live` for yfinance + RSS |
| `AI_PROVIDER` | `ollama` | `ollama`, `anthropic`, or `openai` |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama API endpoint |
| `OLLAMA_MODEL` | `qwen2.5:14b` | Model for AI features |
| `DATABASE_URL` | `sqlite+aiosqlite:///./sdi.db` | PostgreSQL in Docker, SQLite locally |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `ANTHROPIC_API_KEY` | *(empty)* | Optional: for Claude-based AI |
| `OPENAI_API_KEY` | *(empty)* | Optional: for OpenAI-based AI |

Every live adapter **falls back to mock** if its dependency or key is missing. Zero-config works out of the box.

---

## 🏗️ Architecture

```
                    ┌─────────────────────────────┐
                    │   Next.js 14 (Port 3000)    │
                    │   React 18 + TypeScript     │
                    │   TanStack Query + Recharts │
                    │   Framer Motion + Tailwind  │
                    └──────────┬──────────────────┘
                               │ REST + WebSocket
                    ┌──────────▼──────────────────┐
                    │   FastAPI (Port 8000)        │
                    │   15 route modules           │
                    │   18 service modules          │
                    │   Adapter pattern (mock/live)│
                    └──┬────────┬────────┬────────┘
                       │        │        │
              ┌────────▼─┐ ┌───▼────┐ ┌─▼────────────┐
              │ Postgres  │ │ Redis  │ │ Ollama       │
              │ (history, │ │ (cache,│ │ (qwen2.5:14b)│
              │  watchlists│ │  alerts│ │ local LLM    │
              │  alerts)  │ │  pubsub│ │ zero cost    │
              └───────────┘ └───┬────┘ └──────────────┘
                                │
                    ┌───────────▼──────────────────┐
                    │   Celery Worker + Beat       │
                    │   ETL: 30s / 5m / 10m / 15m  │
                    │   market, news, sentiment,   │
                    │   scoring pipelines           │
                    └──────────────────────────────┘
```

---

## 📊 Data Sources

| Source | Type | API Key? | What It Provides |
|--------|------|----------|-----------------|
| **yfinance** | Market data | No | Quotes, OHLCV candles, fundamentals, earnings |
| **RSS feeds** | News | No | Market news from major financial outlets |
| **Reddit (PRAW)** | Sentiment | Free app | r/wallstreetbets, r/stocks trending analysis |
| **Google Trends** | Sentiment | No | Search interest for tickers |
| **Ollama** | AI | No (local) | Research reports, briefings, explanations, advisor |
| **Mock adapter** | Fallback | No | Deterministic offline data for all endpoints |

---

## 🧪 Testing

```bash
cd backend
pytest -q                    # Run all tests
pytest tests/test_api.py     # API route tests
pytest tests/test_auth.py    # JWT auth tests
pytest tests/test_scoring.py # Scoring engine tests
pytest tests/test_watchlists.py # Watchlist CRUD tests
```

---

## 🔧 Available Scripts

### Frontend

| Script | Command | Description |
|--------|---------|-------------|
| **Dev Server** | `npm run dev` | Start HMR dev server at localhost:3000 |
| **Build** | `npm run build` | Compile and bundle for production |
| **Start** | `npm run start` | Serve production build |
| **Lint** | `npm run lint` | Run ESLint across all source files |

### Backend

| Script | Command | Description |
|--------|---------|-------------|
| **Dev Server** | `uvicorn app.main:app --reload` | Start with hot reload at localhost:8000 |
| **Tests** | `pytest -q` | Run all tests |
| **Worker** | `celery -A app.etl.celery_app.celery_app worker` | Start Celery worker |
| **Beat** | `celery -A app.etl.celery_app.celery_app beat` | Start Celery scheduler |
| **Validate** | `python scripts/validate_live.py` | Smoke test live adapters |

### Docker

| Script | Command | Description |
|--------|---------|-------------|
| **Full Stack** | `docker compose -f infra/docker-compose.yml up --build` | Start all 6 services |
| **Rebuild** | `docker compose -f infra/docker-compose.yml up --build --force-recreate` | Force rebuild |
| **Logs** | `docker compose -f infra/docker-compose.yml logs -f api` | Follow API logs |
| **Down** | `docker compose -f infra/docker-compose.yml down -v` | Stop and remove volumes |

---

## 🚨 Troubleshooting

### Issue: `npm install` fails with peer dependency errors

**Solution:** Use the legacy peer deps flag:

```bash
npm install --legacy-peer-deps
```

### Issue: Port 3000 or 8000 already in use

**Solution:** Kill the existing process or use a different port:

```bash
# Frontend
npm run dev -- --port 3001

# Backend
uvicorn app.main:app --reload --port 8001
```

### Issue: Ollama not responding / AI features return errors

**Solution:** Ensure Ollama is running and the model is downloaded:

```bash
ollama serve                    # Start Ollama server
ollama list                     # Check installed models
ollama pull qwen2.5:14b         # Download if missing
```

For Docker: Ollama runs on the host, so the API container uses `host.docker.internal:11434` to reach it. Ensure `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1` in `.env`.

### Issue: Charts not rendering / blank dashboard

**Solution:** The dashboard fetches data on mount. In mock mode it works instantly. In live mode, ensure the backend is reachable:

```bash
curl http://localhost:8000/health    # Should return {"status": "ok"}
```

### Issue: Docker build fails on Apple Silicon (M1/M2/M3)

**Solution:** Add platform flag:

```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -f infra/docker-compose.yml up --build
```

### Issue: PostgreSQL connection refused

**Solution:** Wait for the health check to pass. Check status:

```bash
docker compose -f infra/docker-compose.yml ps
```

If postgres shows "unhealthy", check logs:

```bash
docker compose -f infra/docker-compose.yml logs postgres
```

---

## 📚 Documentation

17 detailed documentation files in the `docs/` folder:

| File | Topic |
|------|-------|
| `GETTING-STARTED.md` | Quick start and first steps |
| `01-PRD.md` | Product Requirements Document |
| `02-ARCHITECTURE.md` | System architecture and data flow |
| `03-DATABASE.md` | PostgreSQL schema and models |
| `04-API.md` | Full API reference |
| `05-STREAMING.md` | WebSocket and real-time events |
| `06-ETL.md` | Celery ETL pipeline documentation |
| `07-FOLDER-STRUCTURE.md` | Codebase organization guide |
| `08-SCORING.md` | Discovery scoring algorithm |
| `09-DESIGN-SYSTEM.md` | UI/UX design tokens and components |
| `10-WIREFRAMES.md` | Page layout wireframes |
| `11-COMPONENTS.md` | React component library docs |
| `12-TESTING.md` | Test strategy and coverage |
| `13-DEPLOYMENT.md` | Production deployment guide |
| `14-MONITORING.md` | Observability and logging |
| `15-RISK.md` | Risk assessment |
| `16-ROADMAP.md` | Feature roadmap and milestones |

---

## 📈 Project Stats

| Metric | Count |
|--------|-------|
| **Total files** | 127 |
| **Backend Python files** | 76 |
| **Frontend TSX/TS files** | 39 |
| **API route modules** | 15 |
| **Service modules** | 18 |
| **Dashboard widgets** | 12 |
| **Portfolio components** | 10 |
| **Stock detail components** | 7 |
| **Pages** | 11 |
| **API endpoints** | 40+ |
| **Safe investment instruments** | 22 (16 IN + 6 US) |
| **Documentation files** | 17 |
| **Test modules** | 4 |

---

## 👨‍💻 Author

**Vector**
GitHub: [@HalcyonVector](https://github.com/HalcyonVector)

---

## 📄 License

No specific license. Contact the author for usage rights.

---

**Made with 📊 for intelligent investors and curious learners**
