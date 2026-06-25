"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
}

export function MarketOverview() {
  const { data: movers } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const { data: discovery } = useQuery({ queryKey: ["discovery"], queryFn: () => api.discovery() });

  const allQuotes = [
    ...(movers?.gainers ?? []),
    ...(movers?.losers ?? []),
  ];

  // Deduplicate by symbol
  const seen = new Set<string>();
  const unique = allQuotes.filter((q) => {
    if (seen.has(q.symbol)) return false;
    seen.add(q.symbol);
    return true;
  });

  const avgChange = unique.length
    ? unique.reduce((s, q) => s + q.change_pct, 0) / unique.length
    : 0;
  const totalTracked = discovery?.length ?? 0;
  const topGainer = movers?.gainers?.[0];
  const topLoser = movers?.losers?.[0];

  // Breadth: advancers vs decliners
  const advancers = unique.filter((q) => q.change_pct > 0).length;
  const decliners = unique.filter((q) => q.change_pct < 0).length;

  // Total market cap + volume
  const totalMcap = unique.reduce((s, q) => s + (q.market_cap ?? 0), 0);
  const totalVolume = unique.reduce((s, q) => s + (q.volume ?? 0), 0);

  // Render local time only after mount to avoid an SSR/client hydration mismatch.
  const [time, setTime] = useState("—");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 60_000);
    return () => clearInterval(id);
  }, []);

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
      icon: ArrowUpCircle,
      label: "Breadth",
      value: `${advancers}↑ / ${decliners}↓`,
      sub: advancers > decliners ? "bullish" : advancers < decliners ? "bearish" : "neutral",
      color: advancers > decliners ? "text-emerald-400" : advancers < decliners ? "text-crimson-400" : "text-ink-300",
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
      icon: DollarSign,
      label: "Mkt Cap",
      value: totalMcap > 0 ? "$" + formatLargeNumber(totalMcap) : "—",
      sub: "total",
      color: "text-ink-300",
    },
    {
      icon: Activity,
      label: "Volume",
      value: totalVolume > 0 ? formatLargeNumber(totalVolume) : "—",
      sub: "shares",
      color: "text-ink-300",
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
