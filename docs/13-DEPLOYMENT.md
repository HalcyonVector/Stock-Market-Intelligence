# Deployment Architecture

## Local (one command)
```
docker compose -f infra/docker-compose.yml up --build
# web → http://localhost:3000   api → http://localhost:8000/docs
```
Services: postgres, redis, api, worker, beat, web. Schema + seed auto-load on
first Postgres boot.

## Cloud (recommended free/low-cost path)
| Component | Platform | Why |
|-----------|----------|-----|
| Frontend | **Vercel** | First-class Next.js, edge CDN, preview deploys |
| API + worker + beat | **Railway** | Dockerfile deploy, managed Redis, cron-like |
| Postgres | **Supabase** (or Railway PG) | managed PG, generous free tier |
| Redis | Railway / Upstash | serverless Redis for cache+bus+broker |

### Topology
```
Vercel (web)  ──HTTPS──►  Railway (FastAPI api, ≥1 replica)
                              │
        Upstash Redis ◄───────┼────► Railway worker + beat
                              ▼
                        Supabase Postgres
```

## Configuration
- All via env (`.env.example` in each app). Secrets in platform secret stores —
  never committed.
- `DATA_MODE=mock` for demo; `live` once free keys are added.
- Set `BACKEND_URL` (web) and `CORS_ORIGINS` (api) to deployed hostnames.

## Scaling levers
- API is stateless → bump replica count; Redis pub/sub handles fan-out.
- Worker concurrency and beat cadence tuned via env.
- Postgres → add read replica / TimescaleDB when history grows.

## Trade-offs
- Railway/Supabase free tiers sleep/limit — fine for MVP, plan paid tier for
  always-on. *Alternative:* single VPS + docker-compose (cheaper, more ops);
  Fly.io (good WS support, global).
