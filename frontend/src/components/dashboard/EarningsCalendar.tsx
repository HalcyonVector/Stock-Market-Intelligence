"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export function EarningsCalendar() {
  const { data, isLoading } = useQuery({
    queryKey: ["earnings"],
    queryFn: () => api.earnings(),
    staleTime: 30 * 60 * 1000,
  });

  const items = (data ?? []).filter((e: any) => e.days_until !== null && e.days_until !== undefined).slice(0, 10);

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Upcoming Earnings"
      icon={<Calendar size={14} className="text-amber-400" />}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-white/5" />
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-500 py-4 text-center">No upcoming earnings data</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.map((e: any) => (
            <Link key={e.symbol} href={`/stock/${e.symbol}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 transition">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-ink-100">{e.symbol}</span>
                <span className="text-[10px] text-ink-500 truncate max-w-[100px]">{e.name}</span>
              </div>
              <div className="text-right">
                <span className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10px] font-medium",
                  e.days_until <= 3 ? "bg-crimson-600/15 text-crimson-400"
                  : e.days_until <= 7 ? "bg-amber-500/10 text-amber-400"
                  : "bg-white/5 text-ink-300"
                )}>
                  {e.days_until === 0 ? "Today" : e.days_until === 1 ? "Tomorrow" : `${e.days_until}d`}
                </span>
                {e.history?.[0]?.surprise_pct != null && (
                  <span className={cn(
                    "ml-1 text-[9px] font-mono",
                    e.history[0].surprise_pct >= 0 ? "text-emerald-400" : "text-crimson-400"
                  )}>
                    Last: {e.history[0].surprise_pct >= 0 ? "+" : ""}{e.history[0].surprise_pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </BentoCard>
  );
}
