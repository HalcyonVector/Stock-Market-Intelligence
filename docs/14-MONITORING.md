# Monitoring Plan

## Golden signals
| Signal | Where | Tool |
|--------|-------|------|
| Latency | API p50/p95/p99 per route | Prometheus + Grafana / platform metrics |
| Traffic | req/s, active WS connections | gauge in `realtime/manager` |
| Errors | 5xx rate, adapter fallbacks | structlog → log aggregator |
| Saturation | worker queue depth, Redis mem, PG connections | Redis/PG exporters |

## Application observability
- **Structured logs** (`structlog`, JSON in prod): one event per action with
  `symbol`, `task`, counts. Pipe to Loki / Datadog / platform logs.
- **Health endpoint** `/health` reports env, data/AI mode, and Redis reachability
  → use for uptime checks and load-balancer probes.
- **Pipeline metrics to emit (next):** rows ingested per task, events published,
  cache hit ratio, AI tokens + latency + fallback count.

## Data-quality monitors
- Staleness alarm: latest `price_snapshots.ts` older than 2× cadence.
- Coverage: discovery scan returns < universe size → provider degradation.
- AI guardrail: explanation generated but `confidence < 0.4` flagged for review.

## Alerting (suggested thresholds)
| Alert | Condition |
|-------|-----------|
| API down | `/health` fails 3× |
| Stale market data | no new snapshot in 2 min |
| Worker stalled | beat heartbeat missing 5 min |
| Redis saturation | mem > 80% |
| Error spike | 5xx > 2% over 5 min |

## Cost monitors
AI token spend per day; provider API call counts vs free-tier limits (fail closed
to mock when limits hit — already the adapter default).
