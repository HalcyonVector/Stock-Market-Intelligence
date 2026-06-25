# Risk Analysis

## Product / legal
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Perceived as investment advice | Regulatory / trust | Persistent disclaimer; no buy/sell language in prompts; no personalization |
| AI hallucination in explanations | Misinformation | Evidence-only prompts; show supporting signals + confidence; never assert beyond provided data |
| Provider ToS violation | Access loss | Store only public data; respect rate limits; adapter isolates per-source rules |
| Misleading scores | User harm | Full formula/weights/confidence exposed; "transparent by design" |

## Technical
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Provider outage / rate limit | Stale data | Graceful mock fallback; cached last-good; staleness alarms |
| WebSocket scale | Dropped live updates | Stateless API + Redis fan-out; SSE fallback; socket pruning |
| Data volume growth | Slow queries | Composite indexes; TimescaleDB/partition path |
| Single point: Redis | Cache+bus+broker down | Managed Redis w/ persistence; API still serves DB reads |
| AI cost runaway | Budget | Token monitors; cache insights in `insight_reports`; fail to mock on cap |
| Solo-engineer bus factor | Stalled project | Mock-first dev, docs set, docker one-command, high test coverage on core |

## Data integrity
| Risk | Mitigation |
|------|-----------|
| Duplicate news / events | `UNIQUE(url)`; idempotent appends |
| Clock skew across sources | All timestamps stored TZ-aware (UTC) |
| Bad symbol / market mapping | `UNIQUE(symbol, market)`; universe whitelist |

## Security
- No brokerage credentials, no trading, no PII beyond stub user id.
- Secrets via env/secret stores; CORS locked to known origins.
- Input validation via pydantic on every route.

## Open risks to revisit
Sentiment source reliability (X API cost/limits), institutional/insider data
availability on free tiers (may require paid feed in Phase 4), and weight
calibration without lookahead bias (Phase 5, strict backtest controls).
