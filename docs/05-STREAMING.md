# Streaming & Real-time Architecture

## Goals
The platform must "feel alive" without hammering providers or the DB. Refresh
cadences (configurable in `core/config.py`):

| Data | Cadence | Mechanism |
|------|---------|-----------|
| Market quotes / ticks | 15–60s (default 30s) | Celery beat → worker → Redis pub/sub → WS |
| News | 5m | Celery beat → ingest → cache |
| Sentiment | 5–15m (default 10m) | Celery beat → aggregate |
| Discovery scores | 15m | Celery beat → recompute → event |

## Fan-out design
```
worker (publish) ──► Redis channel events:market / ticks:price
                         │ (every API replica subscribes)
   api replica 1 ◄───────┤
   api replica 2 ◄───────┘
        │ local WebSocket sockets
        ▼
     browsers
```
Each API process runs one background `pubsub` listener (`realtime/manager.py`)
that relays Redis messages to its connected sockets. Producers never know about
sockets; consumers never know about producers. This is what lets the API scale to
N replicas behind a load balancer.

## Why Redis pub/sub (not Kafka) for MVP
- One dependency already in the stack (cache + broker + bus).
- At-most-once delivery is fine: ticks are ephemeral; durable events are also
  written to `market_events` in Postgres for replay/history.
- *Upgrade path:* swap to Kafka/Redpanda when we need replay, consumer groups,
  and multi-region durability. The `publish_event()` seam isolates the change.

## Client strategy
WebSocket primary, SSE fallback (`/sse/live`) for restrictive networks. The React
`useLiveFeed` hook auto-reconnects with backoff and degrades silently if the
backend is down (dashboard still renders polled REST data).

## Backpressure & safety
- Worker `prefetch_multiplier=1`, `acks_late=True` → no lost tasks on crash.
- Dead sockets are pruned on send failure.
- Event volume is bounded by universe size × cadence; the rolling client buffer
  caps at 40 events.
