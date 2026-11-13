"use client";
import { cn } from "@/lib/utils";

/** Marks a price that isn't a live quote: "Sample" (mock data served because
 *  every live source failed), "Delayed" (midday NSE snapshot) or "EOD" (last
 *  daily close). Renders nothing for live quotes. `source` comes from the
 *  API's quote object. */
export function SourceBadge({ source, ts, className }: { source?: string; ts?: string; className?: string }) {
  const eod = source === "eod" || (!source && ts && String(ts).includes("T00:00:00"));
  if (source === "mock") {
    return (
      <span
        title="Live data sources didn't answer, so this is made-up sample data. Don't rely on it."
        className={cn("inline-flex items-center rounded-md border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300", className)}
      >
        Sample
      </span>
    );
  }
  if (source === "delayed") {
    return (
      <span
        title="Delayed intraday price from the midday NSE update, not a live quote."
        className={cn("inline-flex items-center rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300", className)}
      >
        Delayed
      </span>
    );
  }
  if (eod) {
    return (
      <span
        title="Last daily close, not a live quote (free live quotes aren't available for this stock)."
        className={cn("inline-flex items-center rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300", className)}
      >
        EOD
      </span>
    );
  }
  return null;
}
