# Component Inventory

## Layout
| Component | File | Role |
|-----------|------|------|
| TopBar | `layout/TopBar.tsx` | Brand, ⌘K trigger, sticky glass header |
| RootLayout | `app/layout.tsx` | Providers, shell, disclaimer footer |

## UI primitives
| Component | File | Role |
|-----------|------|------|
| BentoCard | `ui/BentoCard.tsx` | Animated glass tile, configurable grid span |
| ScorePill | `ui/ScorePill.tsx` | Color-coded score chip |
| CommandPalette | `ui/CommandPalette.tsx` | ⌘K ticker search overlay |

## Dashboard module
| Component | File | Data source |
|-----------|------|-------------|
| Dashboard | `dashboard/Dashboard.tsx` | composes the bento grid |
| MarketBriefing | `dashboard/MarketBriefing.tsx` | `/insights/briefing` |
| OpportunityRadar | `dashboard/OpportunityRadar.tsx` | `/discovery` |
| MoversList | `dashboard/MoversList.tsx` | `/market/movers` |
| SectorHeatmap | `dashboard/SectorHeatmap.tsx` | `/sectors/rotation` |
| SentimentTrends | `dashboard/SentimentTrends.tsx` | `/sentiment/trending` |
| LiveFeed | `dashboard/LiveFeed.tsx` | WebSocket `useLiveFeed` |

## Stock module
| Component | File | Data source |
|-----------|------|-------------|
| StockIntelligence | `stock/StockIntelligence.tsx` | `/stocks/{s}` |
| WhyMovingCard | `stock/WhyMovingCard.tsx` | `/stocks/{s}/why` |
| PriceChart | `stock/PriceChart.tsx` | `/market/candles/{s}` (Recharts) |

## Hooks & lib
| Item | File | Role |
|------|------|------|
| useLiveFeed | `hooks/useLiveFeed.ts` | WS connect + reconnect + buffer |
| api | `lib/api.ts` | typed fetch client |
| Providers | `lib/providers.tsx` | TanStack Query client |
| utils | `lib/utils.ts` | cn, pct, score/change colors |

## Conventions
Server Components by default; `"use client"` only where state/queries/animation
are needed. Each component owns its own query (co-located data fetching) so cards
load independently and a slow endpoint never blocks the grid.
