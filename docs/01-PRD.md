# Product Requirements Document — Stock Discovery & Intelligence

> Educational and informational use only. The platform never provides
> personalized investment advice, stores brokerage credentials, or executes trades.

## 1. Problem
Retail investors and researchers drown in raw market data but lack *explained*
signal. Existing screeners answer "what passed my filter" — not "what deserves
attention and **why**". We build a Bloomberg-style intelligence layer that
prioritises explainability and discovery over yet another data grid.

## 2. Vision
An AI market analyst that answers, in one glance:
*Which stocks deserve attention today? Why is this stock moving? Where is capital
rotating? What is retail discussing? What is quietly emerging?*

## 3. Users
| Tier | Persona | Primary job-to-be-done |
|------|---------|------------------------|
| Primary | Retail investor, finance student, beginner, enthusiast, trader | Understand market moves fast; discover ideas before mainstream |
| Secondary | Analyst, content creator, researcher, founder | Source explained signal + evidence for their own work |

## 4. Success metrics
| Goal | Metric | Target (MVP) |
|------|--------|--------------|
| Faster understanding | Time-to-insight on a stock page | < 10s to read AI explanation + evidence |
| Discovery value | % sessions that open a non-searched ("discovered") stock | > 40% |
| Real-time feel | Median dashboard data age | < 60s |
| Trust | % insights with attached evidence + confidence | 100% |
| Retention | D7 return rate | > 25% |

## 5. Core modules (functional requirements)
1. **Discovery Engine** — emerging small caps, fastest growers, volume breakouts,
   momentum leaders, insider/institutional signals. *Answers: what to look at today.*
2. **Why Is This Stock Moving? (flagship)** — auto-analyse news, earnings, volume,
   sector, institutional, sentiment → AI explanation + confidence + supporting
   signals + event timeline.
3. **Retail Sentiment Intelligence** — Reddit / X / communities / Google Trends →
   mention volume, sentiment, attention, growth rate.
4. **Sector Rotation Dashboard** — inflow/outflow + momentum across Banking, IT,
   Pharma, Auto, Defence, Capital Goods, Energy, Infrastructure, FMCG.
5. **Opportunity Radar** — composite Opportunity Score ranking for prioritisation.

## 6. Non-functional requirements
- **Explainability:** every score and insight exposes formula, inputs, weights,
  confidence, and cited evidence. No black boxes.
- **Real-time:** market 15–60s, news 5m, sentiment 5–15m, scores 15m; live event
  feed over WebSocket (SSE fallback).
- **Compliance:** store only public data; persistent educational disclaimer.
- **Scalability:** stateless API replicas; Redis bus for fan-out; append-only
  time-series for history/back-test.
- **Solo-operable:** mock-first data layer means zero keys to run end-to-end.

## 7. Out of scope (MVP)
Order execution, portfolio accounting, paid market-data feeds, mobile native apps,
auth/billing beyond a stub user id.

## 8. Release gates
MVP ships when: dashboard renders live mock data, stock page produces an
explanation with evidence + confidence, discovery ranks the universe, and the
whole stack boots via `docker compose up`.
