# UI Wireframes (low-fidelity)

## Homepage / Dashboard — bento layout
```
┌───────────────────────────────────────────────────────────────────────┐
│  StockIntel                                       [ ⌘K  Search markets ]│
├───────────────────────────────────────────────────────────────────────┤
│  What is happening in the market right now?                              │
│  Discovery, sentiment and sector intelligence — explained.              │
│                                                                         │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │  AI MARKET BRIEFING   ✦      │  │  OPPORTUNITY RADAR               │ │
│  │  3–5 sentence synthesis...   │  │  1 NVDA  +4.2%   78               │ │
│  │  (movers+sectors+scores)     │  │  2 PLTR  +6.1%   74              │ │
│  │                              │  │  3 HAL   +2.0%   71              │ │
│  └─────────────────────────────┘  └──────────────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐ │
│  │ UNUSUAL      │ │ LIVE MOVERS      │ │ SECTOR ROTATION (heatmap)    │ │
│  │ ACTIVITY ●live│ │ Gainers│ Losers │ │ [IT 62][Energy 58][Pharma 41]│ │
│  │ NVDA unusual │ │ ...    │ ...     │ │ [Auto 39][Banking 55]  ...   │ │
│  └──────────────┘ └──────────────────┘ └──────────────────────────────┘ │
│  ┌──────────────────────────────┐                                       │
│  │ RETAIL SENTIMENT             │   (more bento tiles add here)         │
│  │ TSLA  12,400 mentions  +0.4  │                                       │
│  └──────────────────────────────┘                                       │
├───────────────────────────────────────────────────────────────────────┤
│  Educational and informational use only. Not investment advice.         │
└───────────────────────────────────────────────────────────────────────┘
```

## Stock Intelligence Page
```
┌───────────────────────────────────────────────────────────────────────┐
│  ← Back            NVDA   NVIDIA · IT · US          USD 142.30  +4.2%    │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────┐ │
│  │ WHY IS THIS STOCK MOVING?  ✦         │  │ KEY METRICS              │ │
│  │ "NVDA rose 4.2% on 3.1x volume after │  │ Market   US              │ │
│  │  ... institutional inflows."         │  │ Sector   IT              │ │
│  │ [confidence 85%] [opp 78][mom 81]... │  │ Mkt Cap  ...             │ │
│  │ Timeline ● 14:02 news ● 13:30 price  │  │ Volume   ...             │ │
│  └─────────────────────────────────────┘  └──────────────────────────┘ │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────┐ │
│  │ PRICE (90d)  ╱╲  area chart          │  │ RECENT NEWS              │ │
│  │              ╱  ╲___                  │  │ • headline (source)      │ │
│  └─────────────────────────────────────┘  └──────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

## Command palette (⌘K)
Overlay, glass card, ticker input + suggested chips → routes to `/stock/{SYM}`.

## Interaction notes
- Hover intelligence: score pills expand to show factor contributions (Phase 2).
- Live feed animates new events in from the left; "live" dot pulses when connected.
- Every card links into the relevant stock/sector deep-dive.
