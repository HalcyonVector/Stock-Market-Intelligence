"use client";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

const IMPACT_COLORS = {
  high: "bg-crimson-600/15 text-crimson-400 border-crimson-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-white/5 text-ink-300 border-white/10",
};

const CATEGORY_ICONS: Record<string, string> = {
  monetary_policy: "🏛️",
  employment: "👷",
  inflation: "📈",
  growth: "📊",
  consumer: "🛒",
  manufacturing: "🏭",
  housing: "🏠",
};

export function EconomicCalendar() {
  const { data, isLoading } = useQuery({
    queryKey: ["economicCalendar"],
    queryFn: () => api.economicCalendar(),
    staleTime: 60 * 60 * 1000,
  });

  const events = data?.events?.slice(0, 8) ?? [];

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Economic Calendar"
      icon={<Landmark size={14} className="text-crimson-400" />}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-white/5" />
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {events.map((e: any, i: number) => (
            <div key={i} className="group rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{CATEGORY_ICONS[e.category] || "📅"}</span>
                  <span className="text-xs text-ink-100 font-medium">{e.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase",
                    IMPACT_COLORS[e.impact as keyof typeof IMPACT_COLORS] || IMPACT_COLORS.low
                  )}>
                    {e.impact}
                  </span>
                  <span className={cn(
                    "text-[10px] font-mono",
                    e.days_until <= 2 ? "text-crimson-400" : e.days_until <= 7 ? "text-amber-400" : "text-ink-500"
                  )}>
                    {e.days_until === 0 ? "Today" : `${e.days_until}d`}
                  </span>
                </div>
              </div>
              <p className="mt-0.5 text-[10px] text-ink-500 line-clamp-1 group-hover:line-clamp-none transition-all">
                {e.description} · Avg S&P move: ±{e.avg_sp500_move}%
              </p>
            </div>
          ))}
        </div>
      )}
    </BentoCard>
  );
}
