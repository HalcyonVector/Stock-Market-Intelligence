"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
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
  const market = useMarket();
  const { data: movers } = useQuery({ queryKey: ["movers", market], queryFn: () => api.movers(market) });
  const { data: discovery } = useQuery({ queryKey: ["discovery", market], queryFn: () => api.discovery(market) });

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

  const stats: { icon: typeof Clock; label: string; value: string; sub: string; color: string; phone?: boolean }[] = [
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
      phone: true,
      value: `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%`,
      sub: "market-wide",
      color: avgChange >= 0 ? "text-emerald-400" : "text-crimson-400",
    },
    {
      icon: ArrowUpCircle,
      label: "Breadth",
      phone: true,
      value: `${advancers}↑ / ${decliners}↓`,
      sub: advancers > decliners ? "bullish" : advancers < decliners ? "bearish" : "neutral",
      color: advancers > decliners ? "text-emerald-400" : advancers < decliners ? "text-crimson-400" : "text-ink-300",
    },
    {
      icon: TrendingUp,
      label: "Top Gainer",
      phone: true,
      value: topGainer?.symbol ?? "—",
      sub: topGainer ? `+${topGainer.change_pct.toFixed(1)}%` : "",
      color: "text-emerald-400",
    },
    {
      icon: TrendingDown,
      label: "Top Loser",
      phone: true,
      value: topLoser?.symbol ?? "—",
      sub: topLoser ? `${topLoser.change_pct.toFixed(1)}%` : "",
      color: "text-crimson-400",
    },
    // Market cap only when the quotes carry it (free sources often don't).
    ...(totalMcap > 0 ? [{
      icon: DollarSign,
      label: "Mkt Cap",
      value: "$" + formatLargeNumber(totalMcap),
      sub: "total",
      color: "text-ink-300",
    }] : []),
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
    // Phones get the four stats that say what the market did, in an even 2x2;
    // wider screens get the full strip.
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 backdrop-blur-xl sm:flex sm:flex-wrap sm:items-center sm:gap-6 sm:px-5">
      {stats.map((s) => (
        <div key={s.label} className={cn("min-w-0 items-center gap-2", s.phone ? "flex" : "hidden sm:flex")}>
          <s.icon size={14} className="shrink-0 text-ink-500" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">{s.label}</p>
            <p className={cn("truncate font-mono text-sm font-semibold", s.color)}>
              {s.value} <span className="block text-[10px] font-normal text-ink-500 sm:inline">{s.sub}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
