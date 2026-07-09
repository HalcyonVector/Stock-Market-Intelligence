# StockIntel — Free-Tier Cloud Deployment Guide

Deploy the full StockIntel stack for $0/month using Vercel + Render + Neon + Upstash + Groq.

## Architecture

```
Browser → Vercel (Next.js frontend)
              ↓ /api/* rewrite
         Render (FastAPI + Celery worker + beat — single process)
              ↓                    ↓
     Neon (Postgres)        Upstash (Redis)
              ↓
         Groq (LLM)
```

## Prerequisites

- GitHub account (repo must be pushed to GitHub for Vercel and Render to deploy from)
- Free accounts on: [Groq](https://console.groq.com), [Neon](https://neon.tech), [Upstash](https://upstash.com), [Render](https://render.com), [Vercel](https://vercel.com)

---

## Step 1 — Groq API key

1. Go to https://console.groq.com/keys
2. Click **Create API Key**, name it `stockintel`
3. Copy the key (`gsk_...`). You'll need it in Step 5.

**Free tier limits:** 30 RPM, 6,000 TPM, 1,000 RPD. More than enough for a portfolio project.

**Model:** `llama-3.3-70b-versatile` (default in config). No changes needed.

---

## Step 2 — Neon Postgres

1. Go to https://console.neon.tech → **New Project**
2. Name: `stockintel`, Region: pick closest to your Render region (US East recommended)
3. After creation, copy the **Connection string** from the dashboard. It looks like:
   ```
   postgresql://neondb_owner:xxxx@ep-xxx-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Change two things** in the connection string for SQLAlchemy async:
   - Add `+asyncpg` after `postgresql`
   - Change `?sslmode=require` to `?ssl=require` (asyncpg uses `ssl`, not `sslmode`)
   ```
   postgresql+asyncpg://neondb_owner:xxxx@ep-xxx-xxx-pooler.us-east-2.aws.neon.tech/neondb?ssl=require
   ```
5. Run the schema against Neon. In the Neon console's **SQL Editor**, paste the contents of `db/schema.sql`, then `db/seed.sql`, and run them.

**Free tier:** 0.5 GB storage, 100 compute-hours/month, scale-to-zero. No expiry.

---

## Step 3 — Upstash Redis

1. Go to https://console.upstash.com → **Create Database**
2. Name: `stockintel`, Region: `us-east-1` (match Render/Neon)
3. After creation, go to the database details page
4. Click the **TCP** tab (not REST), then click the eye icon to reveal the password. Copy the **Redis connection string**:
   ```
   rediss://default:xxxx@us1-xxx-xxx.upstash.io:6379
   ```
   The `rediss://` (double s) means TLS — this is required.
5. You need three Redis URLs (different logical databases). Append `/0`, `/1`, `/2`:
   ```
   REDIS_URL=rediss://default:xxxx@us1-xxx.upstash.io:6379/0
   CELERY_BROKER_URL=rediss://default:xxxx@us1-xxx.upstash.io:6379/1
   CELERY_RESULT_BACKEND=rediss://default:xxxx@us1-xxx.upstash.io:6379/2
   ```

**Free tier:** 256 MB, 500K commands/month. With the reduced refresh intervals (already committed), expect ~90K–120K commands/month during active use.

**Important:** Upstash requires TLS. The `rediss://` scheme handles this automatically with the `openai` and `redis` Python libraries. If Celery complains about SSL, add `?ssl_cert_reqs=required` to the broker/result URLs.

---

## Step 4 — Render (Backend)

### 4a. Create Web Service

1. Go to https://dashboard.render.com → **New** → **Web Service**
2. Connect your GitHub repo
3. Configure:
   - **Name:** `stockintel-api`
   - **Region:** US East (Ohio) — matches Neon/Upstash
   - **Root Directory:** `backend`
   - **Runtime:** Docker (it will use your existing `backend/Dockerfile`)
   - **Instance Type:** Free
   - **Start Command override (IMPORTANT):** Leave blank — uses Dockerfile CMD (`uvicorn`)

### 4b. Set Environment Variables

In the Render dashboard under **Environment**, add these:

| Variable | Value |
|----------|-------|
| `ENV` | `prod` |
| `DATA_MODE` | `live` |
| `AI_PROVIDER` | `groq` |
| `GROQ_API_KEY` | `gsk_...` (from Step 1) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `DATABASE_URL` | `postgresql+asyncpg://...` (from Step 2) |
| `REDIS_URL` | `rediss://...@.../0` (from Step 3) |
| `CELERY_BROKER_URL` | `rediss://...@.../1` (from Step 3) |
| `CELERY_RESULT_BACKEND` | `rediss://...@.../2` (from Step 3) |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (plain string, update after Vercel deploy) |
| `AUTH_SECRET` | Generate one: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `AUTO_CREATE_TABLES` | `true` |
| `FINNHUB_API_KEY` | Your Finnhub key (optional) |
| `ALPHAVANTAGE_API_KEY` | Your Alpha Vantage key (optional) |

### 4c. Prevent Sleep + Keep Data Warm (Critical)

Render free services sleep after 15 minutes of inactivity. To keep Celery running **and** keep every dashboard card pre-computed:

1. Go to https://cron-job.org (free, no credit card)
2. Create a cron job:
   - **URL:** `https://stockintel-api.onrender.com/health/warm`  ← note `/warm`
   - **Schedule:** Every 10 minutes
   - **Method:** GET
3. This keeps the service awake (so Celery beat keeps scheduling and WebSockets stay alive) **and** touches every dashboard snapshot. `/health/warm` serves each snapshot instantly and only kicks a background recompute when it is stale, so your data stays fresh without ever blocking a request or hammering provider rate limits.

> **Why `/health/warm` and not `/health`?** `/health` only prevents sleep. `/health/warm` also refreshes the durable snapshots that back Discovery / Top Analyst Picks / Retail Sentiment / Sector Rotation / Heatmap, so the first real visitor after an idle stretch gets warm data instead of empty cards. If you already have a cron pointed at `/health`, just change the path to `/health/warm`.

> **Why 10 minutes, not 5?** Render sleeps after 15 min idle, so 10-min pings still comfortably prevent that. Every ping is a handful of Redis commands per snapshot; halving the frequency roughly halves that load. Upstash's free tier caps at 500K commands/month -- combined with the frontend's own polling (each open dashboard tab re-queries independently), 5-min pings leave much less headroom. If you already have a 5-min job configured, just widen the interval.

**Alternative pingers:** UptimeRobot (free, 5-min intervals — 10 if supported), Kuma (self-hosted).

---

## Step 5 — Vercel (Frontend)

### 5a. Import Project

1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Configure:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)

### 5b. Set Environment Variable

| Variable | Value |
|----------|-------|
| `BACKEND_URL` | `https://stockintel-api.onrender.com` |

This is the only env var needed. The `next.config.mjs` rewrite rule proxies `/api/*` to this URL.

### 5c. Deploy

Click **Deploy**. Vercel will build and assign a URL like `https://stockintel-xxx.vercel.app`.

### 5d. Update CORS on Render

Go back to Render → `stockintel-api` → Environment, update `CORS_ORIGINS` to match your actual Vercel URL (plain string, no brackets or quotes):
```
https://stockintel-xxx.vercel.app
```

Save changes — Render will auto-redeploy.

---

## Step 6 — Verify

1. Hit `https://stockintel-api.onrender.com/health` — should return `{"status":"ok"}`
   (First request takes 30-50s if the service was sleeping)
2. Open your Vercel URL — dashboard should load
3. Click any stock → check that AI explanation loads (confirms Groq is working)
4. Check Upstash console → Commands tab → verify command count is ticking up (confirms Celery/Redis working)
5. Check Neon console → verify tables were created (confirms Postgres working)

---

## What Changed in Code

All changes are already committed. Here's what was modified:

### `backend/app/adapters/ai.py`
Added `GroqAIProvider` class — 18 lines, uses the OpenAI SDK pointed at `https://api.groq.com/openai/v1`. Identical pattern to `OllamaAIProvider`.

### `backend/app/adapters/registry.py`
Added `groq` branch in `ProviderRegistry.ai` — returns `GroqAIProvider` when `AI_PROVIDER=groq` and `GROQ_API_KEY` is set.

### `backend/app/core/config.py`
- Added `"groq"` to `AI_PROVIDER` literal type
- Added `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` settings
- Reduced refresh intervals:
  - `REFRESH_MARKET`: 300 → 900 (15 min, matches yfinance delay)
  - `REFRESH_NEWS`: 600 → 1800 (30 min)
  - `REFRESH_SENTIMENT`: 1800 → 3600 (60 min)
  - `REFRESH_SCORES`: 1800 → 3600 (60 min)

### `backend/.env.example`
Added Groq config block and commented-out cloud deployment section with Neon/Upstash URL templates.

---

## Cost Summary

| Service | Free Tier | Binding Constraint |
|---------|-----------|-------------------|
| Vercel Hobby | 100 GB BW, 100h functions | Non-commercial use only |
| Render Free | 750 instance-hours/mo | Sleeps after 15min (pinger prevents this) |
| Neon Free | 0.5 GB, 100 CU-hrs | Storage (seed data is ~2 MB, won't hit this) |
| Upstash Free | 256 MB, 500K cmds/mo | Commands (reduced intervals keep you at ~100K) |
| Groq Free | 30 RPM, 1K RPD | RPD (only hit by heavy manual use) |
| **Total** | | **$0/month** |

---

## Troubleshooting

**Dashboard empty / "No data" on first deploy:** This is expected. The Celery tasks need 15–20 minutes to warm up the Redis cache with market data. The AI briefing also depends on cached market data, so it won't generate until the cache is populated. Just wait and refresh.

**yfinance 429 errors / "possibly delisted" in logs:** Yahoo Finance rate-limits requests from shared cloud IPs (Render, Railway, etc.). The fallback chain handles this — it retries, then falls through to Finnhub/Alpha Vantage. Once data is cached in Redis, subsequent requests don't hit Yahoo. This noise is heaviest during cold start and subsides within 20–30 minutes.

**Celery tasks not running:** Check that the cron pinger is active. Render logs should show celery beat scheduling messages. If the service is sleeping, tasks won't fire.

**Redis URL parsing error (`must specify one of the following schemes`):** The env var value in Render has the key name baked in (e.g. `REDIS_URL=rediss://...` instead of just `rediss://...`). Render already uses the key field — the value should only contain the URL itself.

**SSL errors with Upstash Redis:** Ensure URLs use `rediss://` (not `redis://`). If Celery still fails, append `?ssl_cert_reqs=required` to broker and result backend URLs.

**`sslmode` error on startup (`connect() got an unexpected keyword argument 'sslmode'`):** asyncpg doesn't support `sslmode`. Change `?sslmode=require` to `?ssl=require` in your `DATABASE_URL`.

**AI returns mock responses:** Verify `AI_PROVIDER=groq` and `GROQ_API_KEY` is set in Render env vars. Check Render logs for `groq.fallback` warnings.

**CORS errors in browser:** Update `CORS_ORIGINS` on Render to exactly match your Vercel URL (including `https://`). Use a plain string, not JSON brackets — the config validator handles both formats.

**Neon connection timeouts:** Neon scales to zero after 5 minutes of inactivity. First query after wake-up takes 1-3s. The app handles this gracefully — SQLAlchemy retries automatically.

**WebSocket disconnects:** If the pinger stops, Render sleeps the service, killing WS connections. The frontend's `useLiveFeed` hook auto-reconnects after 4s. Data will be stale during sleep periods but refreshes on wake.

**Google Trends 429 errors:** Google aggressively rate-limits `pytrends` from cloud IPs. The circuit breaker opens after 2 failures (600s cooldown). Sentiment falls back to StockTwits + mock data. Not fixable without a proxy — harmless for a portfolio project.
