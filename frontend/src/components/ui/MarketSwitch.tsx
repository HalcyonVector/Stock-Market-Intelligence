"use client";
import { MARKETS, useMarket, useSetMarket } from "@/lib/market";
import { cn } from "@/lib/utils";

/** Global / US / India. `compact` is the smaller version in the phone header. */
export function MarketSwitch({ compact = false }: { compact?: boolean }) {
  const market = useMarket();
  const setMarket = useSetMarket();
  return (
    <div role="radiogroup" aria-label="Market" className={cn("flex rounded-lg bg-white/5 p-0.5", compact ? "text-[11px]" : "text-xs")}>
      {MARKETS.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={market === m.id}
          title={m.title}
          onClick={() => setMarket(m.id)}
          className={cn(
            "flex-1 rounded-md transition",
            compact ? "px-2 py-1.5" : "px-2 py-1",
            market === m.id ? "bg-crimson-600/25 text-crimson-300" : "text-ink-400 hover:text-ink-200"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
