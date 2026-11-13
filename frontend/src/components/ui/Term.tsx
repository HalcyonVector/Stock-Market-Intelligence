"use client";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Plain-English definitions for the jargon used around the app. */
export const GLOSSARY: Record<string, string> = {
  "Market Cap": "Total value of all the company's shares (share price × shares outstanding).",
  "Enterprise Value": "Market cap plus debt minus cash: roughly what it would cost to buy the whole business.",
  "P/E": "Price-to-earnings: how many years of current profit you pay for. Higher often means the market expects growth.",
  "P/E (TTM)": "Price ÷ earnings per share over the last twelve months. Higher often means the market expects growth.",
  "P/E (Fwd)": "Price ÷ analysts' estimate of next year's earnings per share.",
  PEG: "P/E divided by expected earnings growth. Around 1 is often read as 'fairly priced for its growth'.",
  "P/B": "Price-to-book: share price vs. the accounting value of the company's net assets.",
  "P/S": "Price-to-sales: market cap divided by yearly revenue. Useful when a company has no profit yet.",
  "EV/Revenue": "Enterprise value divided by yearly revenue.",
  "EV/EBITDA": "Enterprise value divided by operating profit before interest, tax and depreciation. A common takeover-style valuation.",
  EPS: "Earnings per share: net profit divided by the number of shares.",
  "Dividend Yield": "Yearly dividends as a percentage of the share price.",
  Beta: "How much the stock tends to move vs. the overall market. 1 = same, 2 = twice as much, 0.5 = half.",
  Volume: "Number of shares traded today.",
  "Avg Volume": "Typical shares traded per day. Volume far above this often means news or big-investor activity.",
  "RSI (14)": "Relative Strength Index over 14 days (0–100). Above 70 is often called overbought, below 30 oversold.",
  RSI: "Relative Strength Index (0–100). Above 70 is often called overbought, below 30 oversold.",
  MACD: "Moving Average Convergence Divergence: the gap between a fast and slow average. Crossing above its signal line is read as momentum turning up.",
  "Bollinger %B": "Where price sits inside its Bollinger Bands: 1 = at the upper band, 0 = at the lower band.",
  "Stochastic %K": "Where today's close sits within the recent high–low range (0–100).",
  Trend: "Whether price is above its 20-day moving average.",
  Sharpe: "Return earned per unit of volatility. Above 1 is generally considered good.",
  "Sharpe Ratio": "Return earned per unit of volatility. Above 1 is generally considered good.",
  Sortino: "Like Sharpe, but only counts downside volatility as risk.",
  Alpha: "Return above (or below) what simply holding the stock would have earned.",
  "Max Drawdown": "Largest peak-to-trough fall in value during the period: the worst loss you'd have sat through.",
  "Win Rate": "Share of closed trades that made money.",
  Volatility: "How much returns swing around. Higher means a bumpier ride.",
};

/**
 * Renders a label; if it has a glossary entry, adds a dotted underline and a
 * tooltip that works on hover, keyboard focus and tap.
 */
export function Term({ children, className }: { children: string; className?: string }) {
  const def = GLOSSARY[children];
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!def) return <span className={className}>{children}</span>;
  return (
    <span className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="cursor-help border-b border-dotted border-current text-left leading-tight"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/10 bg-base-900 p-2 text-[11px] normal-case leading-snug tracking-normal text-ink-200 shadow-xl"
        >
          {def}
        </span>
      )}
    </span>
  );
}
