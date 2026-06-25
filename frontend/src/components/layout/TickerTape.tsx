"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn, changeColor, pct } from "@/lib/utils";

export function TickerTape() {
  const { data } = useQuery({
    queryKey: ["movers"],
    queryFn: () => api.movers(),
  });

  const tickers = [
    ...(data?.gainers ?? []),
    ...(data?.losers ?? []),
    ...(data?.most_active ?? []),
  ];

  // Dedupe by symbol
  const seen = new Set<string>();
  const unique = tickers.filter((t) => {
    if (seen.has(t.symbol)) return false;
    seen.add(t.symbol);
    return true;
  });

  if (unique.length === 0) return null;

  // Duplicate for seamless loop
  const items = [...unique, ...unique];

  return (
    <div className="relative z-40 overflow-hidden border-b border-white/5 bg-base-950/80 backdrop-blur-xl">
      <div className="ticker-scroll flex whitespace-nowrap py-1.5">
        {items.map((t, i) => (
          <span
            key={`${t.symbol}-${i}`}
            className="inline-flex items-center gap-2 px-4 text-xs"
          >
            <span className="font-mono font-medium text-ink-100">{t.symbol}</span>
            <span className="text-ink-500">${t.price?.toFixed(2)}</span>
            <span className={cn("font-mono", changeColor(t.change_pct))}>
              {pct(t.change_pct)}
            </span>
            <span className="text-ink-700">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
