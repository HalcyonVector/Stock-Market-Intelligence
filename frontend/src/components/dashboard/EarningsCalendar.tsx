"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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

  const items = (data ?? [])
    .filter((e: any) => e.days_until !== null && e.days_until !== undefined)
    .slice(0, 10);

  const lastSurprise = (e: any) => {
    const h = e.history?.[0];
    if (!h || h.surprise_pct == null) return null;
    return h.surprise_pct;
  };

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Upcoming Earnings"
      subtitle="Next reporting dates"
      icon={<Calendar size={14} className="text-amber-400" />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-500 py-8 text-center">No upcoming earnings data</p>
      ) : (
        <div className="space-y-0.5 max-h-[340px] overflow-y-auto scrollbar-thin">
          {items.map((e: any, i: number) => {
            const surprise = lastSurprise(e);
            return (
              <motion.div
                key={e.symbol}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <Link
                  href={`/stock/${e.symbol}`}
                  className="group flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors"
                >
                  {/* Left: Symbol + Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink-100 group-hover:text-crimson-400 transition-colors">
                        {e.symbol}
                      </span>
                      <span className="text-[10px] text-ink-500 truncate max-w-[90px]">
                        {e.name}
                      </span>
                    </div>
                    {/* EPS estimate + range */}
                    {e.eps_estimate != null && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="text-[10px] font-mono text-ink-300">
                          EPS ${e.eps_estimate?.toFixed(2)}
                        </span>
                        {e.eps_low != null && e.eps_high != null && (
                          <span className="text-[9px] text-ink-500">
                            ({e.eps_low?.toFixed(2)}–{e.eps_high?.toFixed(2)})
                          </span>
                        )}
                      </div>
                    )}
                    {/* Last surprise chip */}
                    {surprise !== null && (
                      <span
                        className={cn(
                          "inline-block mt-0.5 rounded-full px-1.5 py-px text-[9px] font-mono font-medium",
                          surprise >= 0
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-crimson-600/10 text-crimson-400"
                        )}
                      >
                        Last: {surprise >= 0 ? "+" : ""}
                        {surprise.toFixed(1)}%
                      </span>
                    )}
                  </div>

                  {/* Right: Countdown badge */}
                  <div className="flex-shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-md px-2 py-1 font-mono text-[11px] font-bold min-w-[44px] text-center",
                        e.days_until <= 3
                          ? "bg-crimson-600/20 text-crimson-400 ring-1 ring-crimson-500/20"
                          : e.days_until <= 7
                            ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20"
                            : "bg-white/5 text-ink-300"
                      )}
                    >
                      {e.days_until === 0
                        ? "Today"
                        : e.days_until === 1
                          ? "Tomorrow"
                          : `${e.days_until}d`}
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
