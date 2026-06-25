"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

const IMPACT_STYLES = {
  high: {
    pill: "bg-crimson-600/20 text-crimson-400 border-crimson-500/30",
    accent: "bg-crimson-500",
  },
  medium: {
    pill: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    accent: "bg-amber-500",
  },
  low: {
    pill: "bg-white/5 text-ink-300 border-white/10",
    accent: "bg-ink-500",
  },
};

const CATEGORY_ICONS: Record<string, string> = {
  monetary_policy: "\u{1F3DB}️",
  employment: "\u{1F477}",
  inflation: "\u{1F4C8}",
  growth: "\u{1F4CA}",
  consumer: "\u{1F6D2}",
  manufacturing: "\u{1F3ED}",
  housing: "\u{1F3E0}",
};

export function EconomicCalendar() {
  const { data, isLoading } = useQuery({
    queryKey: ["economicCalendar"],
    queryFn: () => api.economicCalendar(),
    staleTime: 60 * 60 * 1000,
  });

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const events = data?.events ?? [];

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Economic Calendar"
      subtitle="Key macro events ahead"
      icon={<Landmark size={14} className="text-crimson-400" />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-ink-500 py-8 text-center">No upcoming events</p>
      ) : (
        <div className="space-y-1 max-h-[410px] overflow-y-auto scrollbar-thin">
          {events.map((e: any, i: number) => {
            const impact = IMPACT_STYLES[e.impact as keyof typeof IMPACT_STYLES] || IMPACT_STYLES.low;
            const isExpanded = expandedIdx === i;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className="group cursor-pointer"
              >
                <div
                  className={cn(
                    "relative rounded-lg overflow-hidden transition-colors",
                    "hover:bg-white/[0.04]",
                    isExpanded && "bg-white/[0.03]"
                  )}
                >
                  {/* Left accent bar */}
                  <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg", impact.accent)} />

                  <div className="pl-4 pr-3 py-2">
                    {/* Top row: name + impact + countdown */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-xs flex-shrink-0">
                          {CATEGORY_ICONS[e.category] || "\u{1F4C5}"}
                        </span>
                        <span className="text-xs text-ink-100 font-medium truncate">
                          {e.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider",
                            impact.pill
                          )}
                        >
                          {e.impact}
                        </span>
                        <span
                          className={cn(
                            "font-mono text-[10px] font-bold",
                            e.days_until <= 2
                              ? "text-crimson-400"
                              : e.days_until <= 7
                                ? "text-amber-400"
                                : "text-ink-500"
                          )}
                        >
                          {e.days_until === 0 ? "Today" : e.days_until === 1 ? "1d" : `${e.days_until}d`}
                        </span>
                      </div>
                    </div>

                    {/* Avg S&P move stat */}
                    {e.avg_sp500_move != null && (
                      <p className="mt-0.5 text-[10px] text-ink-500 font-mono">
                        Avg S&P move: <span className="text-ink-300">±{e.avg_sp500_move}%</span>
                      </p>
                    )}

                    {/* Expandable description */}
                    <AnimatePresence>
                      {isExpanded && e.description && (
                        <motion.p
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-[10px] text-ink-500 mt-1 leading-relaxed overflow-hidden"
                        >
                          {e.description}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
