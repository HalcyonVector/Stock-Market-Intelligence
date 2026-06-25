# Roadmap

| Phase | Theme | Deliverables | Status in scaffold |
|-------|-------|--------------|--------------------|
| **1 — MVP** | See the market | Dashboard, top movers, stock pages, news aggregation, AI explanations | ✅ scaffolded & runnable |
| **2** | Understand it | Sentiment tracking, sector rotation, opportunity scoring | ✅ services + UI; **live sources wired (yfinance/RSS/Reddit/Trends)** |
| **3** | Real-time + personal | Live activity feed, alerts, watchlists | ✅ live feed + WS + **watchlists + auth done**; alerts next |
| **4** | Depth | Trend detection, institutional/insider activity, advanced intelligence | seams in place (events, scores); needs data + models |
| **5** | Foresight | Predictive analytics, personalized research feeds | weight calibration + per-user ranking |

## Done in this iteration
- ✅ Live providers wired (`DATA_MODE=live`): yfinance (US + NSE `.NS` + global),
  RSS news (incl. India feeds), Reddit (praw) + Google Trends (pytrends), all with
  mock fallback. `scripts/validate_live.py` checks coverage where network is open.
- ✅ Auth: JWT issue/verify + dev fallback (`get_current_user`).
- ✅ Watchlists: per-user CRUD persisted to Postgres, GET enriched with quotes.

## Immediate next steps
1. Persist snapshots/scores to Postgres in ETL tasks (currently cache+publish).
2. Frontend watchlist UI + login (consume `/auth/token` + `/watchlists`).
3. Price alerts on the live event stream.
4. Playwright E2E + CI gate.
5. Hover intelligence cards (expand ScorePill → factor contributions).
