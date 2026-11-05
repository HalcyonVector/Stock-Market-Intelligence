"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { cn, pct } from "@/lib/utils";

const TYPE_STYLE: Record<string, string> = {
  earnings: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  ex_dividend: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  dividend: "border-emerald-400/20 bg-emerald-500/5 text-emerald-300/80",
};

function when(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

/** Upcoming earnings / dividend dates for the stocks in a watchlist. */
export function WatchlistEvents({ symbols }: { symbols: string[] }) {
  const key = [...symbols].sort().join(",");
  const { data, isLoading } = useQuery({
    queryKey: ["events", key],
    queryFn: () => api.events(symbols, 60),
    enabled: symbols.length > 0,
    staleTime: 60 * 60_000,
  });
  const events: any[] = data?.events ?? [];
  if (!symbols.length) return null;
  return (
    <div className="rounded-xl border border-white/5 bg-black/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-300">
        <CalendarDays size={13} /> Coming up (next 60 days)
      </p>
      {isLoading ? (
        <div className="h-6 w-2/3 animate-pulse rounded bg-white/5" />
      ) : events.length ? (
        <div className="flex flex-wrap gap-1.5">
          {events.slice(0, 12).map((e) => (
            <Link
              key={`${e.symbol}-${e.type}`} href={`/stock/${e.symbol}`}
              title={e.eps_estimate != null ? `EPS estimate ${e.eps_estimate}` : undefined}
              className={cn("rounded-md border px-2 py-1 text-[11px] hover:brightness-125", TYPE_STYLE[e.type])}
            >
              <span className="font-mono font-semibold">{e.symbol}</span> {e.label.toLowerCase()} {when(e.days_until)}
              <span className="ml-1 opacity-60">{new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-500">
          No earnings or dividend dates in the next 60 days{data?.updated ? "" : " (dates refresh daily after the US close)"}.
        </p>
      )}
    </div>
  );
}

/** Last five trading days for the list, plus a short AI recap (one cached
 *  Groq call per watchlist per day at most, loaded only on request). */
export function WatchlistDigest({ id, count }: { id: number; count: number }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useQuery({
    queryKey: ["digest", id, count],
    queryFn: () => api.watchlistDigest(id),
    enabled: open && count > 0,
    staleTime: 30 * 60_000,
  });
  if (!count) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] py-2 text-xs text-ink-300 hover:bg-white/5">
        <Sparkles size={13} className="text-crimson-300" /> Show this week&apos;s recap
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-white/5 bg-black/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-300">
        <Sparkles size={13} className="text-crimson-300" /> This week
        {data && <span className="font-normal text-ink-500">· {data.up} up, {data.down} down, avg {pct(data.avg_week_change_pct)}</span>}
      </p>
      {isFetching && !data && <div className="flex items-center gap-2 text-xs text-ink-500"><Loader2 size={12} className="animate-spin" /> Crunching the week…</div>}
      {isError && <p className="text-xs text-ink-500">Couldn&apos;t build the recap right now. Try again later.</p>}
      {data && (
        <>
          {data.summary && <p className="mb-3 text-xs leading-relaxed text-ink-200">{data.summary}</p>}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {data.rows.map((r: any) => (
              <Link key={r.symbol} href={`/stock/${r.symbol}`}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5 hover:bg-white/5">
                <span className="font-mono text-[11px] font-semibold">{r.symbol}</span>
                <span className={cn("font-mono text-[11px]", r.week_change_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {pct(r.week_change_pct)}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-ink-500">Five trading days to the last daily close. AI summary is educational, not advice.</p>
        </>
      )}
    </div>
  );
}
