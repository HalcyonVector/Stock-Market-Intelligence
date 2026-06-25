# Folder Structure

```
stock-discovery-intelligence/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry + lifespan (pubsub relay)
│   │   ├── core/                   # config, logging, redis client
│   │   ├── adapters/               # provider seam: base, mock, live, ai, registry
│   │   ├── scoring/                # engine (5 scores) + indicators
│   │   ├── services/               # market, discovery, sentiment, sector, explain, briefing
│   │   ├── etl/                    # celery_app + tasks (beat schedule)
│   │   ├── realtime/               # connection manager + pub/sub fan-out
│   │   ├── api/routes/             # market, discovery, stocks, sentiment, sectors, insights, realtime, health
│   │   ├── models/                 # SQLAlchemy entities
│   │   ├── schemas/                # pydantic envelopes
│   │   └── db/                     # async session
│   ├── tests/                      # pytest (scoring + api smoke)
│   ├── requirements.txt · Dockerfile · .env.example · pytest.ini
├── frontend/
│   └── src/
│       ├── app/                    # App Router: layout, page (dashboard), stock/[symbol]
│       ├── components/{ui,dashboard,stock,layout}
│       ├── hooks/                  # useLiveFeed (WebSocket)
│       ├── lib/                    # api client, query provider, utils
│       └── styles/globals.css      # red/black design system
├── db/                             # schema.sql, seed.sql, migrations/
├── infra/                          # docker-compose.yml
├── docs/                           # this documentation set
├── Makefile · README.md · .gitignore
```

## Rationale
- **Vertical seams** (adapters / scoring / services) keep business logic testable
  in isolation and vendor-agnostic.
- **Routes are thin**: they only translate HTTP ⇄ services. All logic lives in
  `services/` + `scoring/`, which have no FastAPI imports → reusable from Celery.
- **Frontend mirrors product modules** (dashboard/stock) so the file tree reads
  like the product.
