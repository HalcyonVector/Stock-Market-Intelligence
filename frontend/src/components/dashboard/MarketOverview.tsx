"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TrendingUp, TrendingDown, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketOverview() {
  const { data: movers } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const { data: discovery } = useQuery({ queryKey: ["discovery"], queryFn: () => api.discovery() });

  const allQuotes = [
    ...(movers?.gainers ?? []),
    ...(movers?.losers ?? []),
  ];
  const avgChange = allQuotes.length
    ? allQuotes.reduce((s, q) => s + q.change_pct, 0) / allQuotes.length
    : 0;
  const totalTracked = discovery?.length ?? 0;
  const topGainer = movers?.gainers?.[0];
  const topLoser = movers?.losers?.[0];

  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const stats = [
    {
      icon: BarChart3,
      label: "Tracked",
      value: totalTracked.toString(),
      sub: "stocks",
      color: "text-ink-300",
    },
    {
      icon: avgChange >= 0 ? TrendingUp : TrendingDown,
      label: "Avg Change",
      value: `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%`,
      sub: "market-wide",
      color: avgChange >= 0 ? "text-emerald-400" : "text-crimson-400",
    },
    {
      icon: TrendingUp,
      label: "Top Gainer",
      value: topGainer?.symbol ?? "—",
      sub: topGainer ? `+${topGainer.change_pct.toFixed(1)}%` : "",
      color: "text-emerald-400",
    },
    {
      icon: TrendingDown,
      label: "Top Loser",
      value: topLoser?.symbol ?? "—",
      sub: topLoser ? `${topLoser.change_pct.toFixed(1)}%` : "",
      color: "text-crimson-400",
    },
    {
      icon: Clock,
      label: "Updated",
      value: time,
      sub: "local",
      color: "text-ink-300",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-3 backdrop-blur-xl">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <s.icon size={14} className="text-ink-500" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500">{s.label}</p>
            <p className={cn("font-mono text-sm font-semibold", s.color)}>
              {s.value} <span className="text-[10px] font-normal text-ink-500">{s.sub}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
