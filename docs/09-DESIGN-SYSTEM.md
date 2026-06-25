# Design System

**Identity:** dark-first, premium, futuristic terminal. Red/black gradient
(inspired by the referenced Utility-Based-Portfolio-Allocation-Agent aesthetic).
References for feel: Perplexity, Linear, Stripe, Bloomberg Terminal, Arc.

## Tokens (`tailwind.config.ts`)
| Token | Value | Use |
|-------|-------|-----|
| `base.950` | `#0a0506` | App background (deep near-black) |
| `base.900/800/700` | `#120709 … #241015` | Surfaces, elevation |
| `crimson.500` | `#e11d3a` | Primary accent / brand |
| `crimson.600/700` | `#b01228 / #7d0d1d` | Gradient depth, negative deltas |
| `ember.500` | `#f5512e` | Secondary warm accent |
| `ink.100→700` | warm greys | Text hierarchy |
| `emerald.400` | system | Positive deltas / high scores |

**Gradients:** `radial-ember` (page bg), `crimson-grad` (brand chips/buttons).
**Shadows:** `glass` (depth) + `glow` (crimson focus halo).

## Surfaces
- `.glass` — `rounded-2xl border-white/5 bg-white/[0.03] backdrop-blur-xl` +
  `shadow-glass`. Used **sparingly** for bento cards (glass effects are an accent,
  not the whole UI — per requirements).
- `.bento` — 12-column responsive grid for the homepage.

## Typography
Geist (sans) for UI, monospace for tickers/numbers/scores so figures align and
read like a terminal.

## Motion
Framer Motion: card entrance (fade+rise 0.4s), live-feed item slide-in, pulsing
"live"/AI glow (`animation: pulseGlow`). Motion is subtle and purposeful — it
signals freshness, never decorates for its own sake.

## Color semantics
Green = positive/high-score, crimson = negative/low-score, amber = neutral/mid.
Never rely on color alone — numbers and labels accompany every signal
(accessibility).

## Anti-patterns (explicitly avoided)
Dense spreadsheet grids, legacy broker chrome, admin-dashboard tables, excessive
borders. Data is rich but presented as cards, heatmaps, and rails.
