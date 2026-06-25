# Testing Strategy

## Test pyramid
| Layer | Scope | Tooling | Status |
|-------|-------|---------|--------|
| Unit | scoring engine, indicators, adapters | pytest | ✅ included (`tests/test_scoring.py`) |
| Integration (API) | route → service → mock adapter | pytest + TestClient | ✅ included (`tests/test_api.py`) |
| Contract | adapter protocols conform to base | pytest (typing + abstract) | recommended next |
| E2E | dashboard + stock flow in a browser | Playwright | Phase 2 |
| Load | WS fan-out + cache under polling | k6 / Locust | Phase 3 |

## What we test now
- **Scores stay in range** and **opportunity rises with momentum** — guards the
  core product promise (transparent, sane scoring).
- **Explainability invariants**: every `ScoreResult` exposes formula, weights, and
  matching contributions.
- **API smoke**: `/health`, `/market/movers`, `/stocks/{s}/why` return expected
  shapes in mock mode (no DB/Redis required).

Run: `cd backend && pytest -q` → currently **6 passing**.

## Principles
- Mock-mode determinism (seeded RNG) makes tests reproducible without network.
- Scoring is pure functions → trivially unit-testable, no fixtures.
- Adapters are tested against the abstract contract so a new vendor can't drift.

## Frontend testing (planned)
- Component tests with Vitest + Testing Library for BentoCard/ScorePill states.
- Playwright E2E: load dashboard, open ⌘K, navigate to a stock, assert the
  "Why moving" card renders explanation + confidence.

## CI gate (recommended)
`pytest` + `ruff` + `tsc --noEmit` + `next lint` must pass before merge.
