"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

type Rating = {
  symbol: string; analysts: number; strong_buy: number; buy: number; hold: number; sell: number; strong_sell: number;
  buy_pct: number; sell_pct: number; score: number; consensus: string; period: string;
  score_change: number | null; sample?: boolean;
};

const TABS = [
  { id: "bullish", label: "Most bullish" },
  { id: "bearish", label: "Most cautious" },
  { id: "changes", label: "Changed" },
] as const;

const BADGE: Record<string, string> = {
  "Strong Buy": "bg-emerald-500/15 text-emerald-300",
  Buy: "bg-emerald-500/10 text-emerald-300/90",
  Hold: "bg-white/5 text-ink-300",
  Sell: "bg-crimson-500/10 text-crimson-300/90",
  "Strong Sell": "bg-crimson-500/15 text-crimson-300",
};

/** Real Wall Street analyst ratings (Finnhub recommendation trends), not the
 *  app's own scores. Updated monthly by the brokers; refreshed daily here. */
export function TopAnalystsPicks() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("bullish");
  const { data, isLoading, dataUpdatedAt, isError, refetch } = useQuery<Rating[]>({
    queryKey: ["analyst-ratings"],
    queryFn: () => api.analystRatings(),
    staleTime: 60 * 60_000,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    if (tab === "bullish") return [...all].sort((a, b) => b.score - a.score || b.analysts - a.analysts);
    if (tab === "bearish") return [...all].sort((a, b) => a.score - b.score || b.analysts - a.analysts);
    return all.filter((r) => r.score_change != null && Math.abs(r.score_change) >= 0.05)
      .sort((a, b) => Math.abs(b.score_change!) - Math.abs(a.score_change!));
  }, [data, tab]);
  const period = data?.find((r) => r.period)?.period;

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()} updatedAt={dataUpdatedAt}
      span="col-span-12 lg:col-span-4"
      title="Analyst Consensus"
      subtitle={`Wall Street ratings for ${data?.length ?? "tracked"} US stocks${period && period !== "sample" ? `, ${new Date(period + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}`}
      icon={<Users size={14} className="text-amber-400" />}
    >
      <div className="mb-2 flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex-1 rounded-md py-1", tab === t.id ? "bg-white/10 text-ink-100" : "text-ink-400 hover:text-ink-200")}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-500">
          {tab === "changes" ? "No rating changes since last month." : "Analyst ratings are loading; they refresh once a day."}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((r) => {
            const seg = (n: number) => `${(n / r.analysts) * 100}%`;
            return (
              <li key={r.symbol}>
                <Link href={`/stock/${r.symbol}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span className="w-14 shrink-0 font-mono text-xs font-bold text-ink-100">{r.symbol}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5"
                      title={`${r.strong_buy} strong buy, ${r.buy} buy, ${r.hold} hold, ${r.sell} sell, ${r.strong_sell} strong sell`}>
                      <div className="bg-emerald-400/80" style={{ width: seg(r.strong_buy) }} />
                      <div className="bg-emerald-600/60" style={{ width: seg(r.buy) }} />
                      <div className="bg-ink-400/40" style={{ width: seg(r.hold) }} />
                      <div className="bg-crimson-600/60" style={{ width: seg(r.sell) }} />
                      <div className="bg-crimson-400/80" style={{ width: seg(r.strong_sell) }} />
                    </div>
                    <span className="mt-0.5 block text-[10px] text-ink-500">
                      {r.analysts} analysts · {r.buy_pct}% buy
                      {tab === "changes" && r.score_change != null && (
                        <span className={r.score_change > 0 ? "text-emerald-300" : "text-crimson-300"}>
                          {" "}· {r.score_change > 0 ? "upgraded" : "downgraded"}
                        </span>
                      )}
                      {r.sample && " · sample"}
                    </span>
                  </div>
                  <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium", BADGE[r.consensus])}>{r.consensus}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-auto pt-2 text-[10px] text-ink-500">Published broker ratings, not a recommendation from this app.</p>
    </BentoCard>
  );
}
