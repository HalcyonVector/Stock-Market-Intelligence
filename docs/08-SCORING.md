# Scoring Systems (Transparent by design)

Implementation: `backend/app/scoring/engine.py`. Every scorer returns value +
inputs + weights + per-factor contributions + explanation + formula + confidence.
The UI renders these directly — nothing is a black box.

All scores normalised 0..100, except **Sentiment** which is signed (−100..100).

## Opportunity Score (headline)
**Formula:** `0.25·momentum + 0.15·sentiment + 0.10·attention + 0.20·institutional + 0.15·rel_strength − 0.15·risk`

| Factor | Weight | Why |
|--------|--------|-----|
| Momentum | 0.25 | Price/volume trend is the strongest short-term attention driver |
| Institutional flow | 0.20 | "Smart money" corroboration |
| Relative strength | 0.15 | Out/under-performance vs sector/index |
| Sentiment | 0.15 | Retail tone, but capped to avoid hype dominance |
| Attention | 0.10 | Rising discussion = emerging interest |
| Risk (penalty) | 0.15 | Tempers speculative names |

**Confidence** = data completeness (fraction of factors with real inputs).

## Momentum Score
`0.30·price_move + 0.30·ret20d + 0.20·volume_ratio + 0.20·rsi_centered`
Rewards positive short- and medium-term returns confirmed by volume; RSI guards
against exhausted moves.

## Sentiment Score (signed)
`100·(0.5·tone + 0.3·tanh(growth) + 0.2·attention_norm)`
`tanh` compresses runaway mention-growth so a single viral spike can't peg the
score; tone (−1..1) is the base.

## Risk Score (higher = riskier)
`0.40·volatility + 0.25·beta + 0.20·max_drawdown + 0.15·volume_spike`
Annualised volatility dominates; beta adds market sensitivity; drawdown captures
tail pain; abnormal volume flags instability.

## Market Attention Score
`0.40·log10(mentions) + 0.40·growth_norm + 0.20·attention`
Log-scales raw mentions (mega-caps always have many) so *acceleration* matters
more than absolute level — that is what surfaces "quietly emerging" names.

## Design principles
- **Bounded & comparable:** every factor clamped before weighting, so scores are
  cross-sectional comparable across symbols and markets.
- **Explainable:** `ScoreResult.contributions` shows exactly how much each factor
  added — directly powers the hover intelligence cards.
- **Tunable:** weights are constants in one file; future work can fit them to
  forward-return data (with strict leakage controls) — a Phase 5 item.
- **Honest confidence:** sparse data → lower confidence, shown next to the score.
