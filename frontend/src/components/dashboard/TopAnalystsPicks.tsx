"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function ratingFromScore(score: number): { label: string; color: string; bg: string } {
  if (score >= 65) return { label: "Strong Buy", color: "text-emerald-400", bg: "bg-emerald-500/15" };
  if (score >= 55) return { label: "Buy", color: "text-emerald-300", bg: "bg-emerald-500/10" };
  if (score >= 45) return { label: "Hold", color: "text-amber-400", bg: "bg-amber-500/10" };
  if (score >= 35) return { label: "Sell", color: "text-crimson-300", bg: "bg-crimson-500/10" };
  return { label: "Strong Sell", color: "text-crimson-400", bg: "bg-crimson-500/15" };
}

function confidenceColor(score: number): string {
  if (score >= 65) return "from-emerald-500 to-emerald-400";
  if (score >= 50) return "from-amber-500 to-amber-400";
  return "from-crimson-500 to-crimson-400";
}

export function TopAnalystsPicks() {
  const { data, isLoading } = useQuery({
    queryKey: ["discovery"],
    queryFn: () => api.discovery(),
  });

  // The discovery feed is sorted by opportunity score (desc). Taking the top 12
  // therefore only ever surfaces Strong Buy / Buy names. To reflect a realistic
  // analyst mix, blend the strongest opportunities (buys) with the weakest ones
  // (genuine sells) — roughly a 70/30 buy-to-sell split. Ratings still come
  // straight from each name's own opportunity score, so nothing is faked.
  const all: any[] = data ?? [];
  const picks =
    all.length > 12
      ? [...all.slice(0, 8), ...all.slice(-4)] // 8 top buys + 4 real sells
      : all;

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Top Analyst Picks"
      subtitle="AI-scored recommendations"
      icon={<Sparkles size={14} className="text-amber-400" />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <p className="text-xs text-ink-500 py-6 text-center">Loading analyst data...</p>
      ) : (
        <div className="space-y-0.5">
          {picks.map((pick: any, i: number) => {
            const score = pick.opportunity ?? 50;
            const confidence = Math.min(100, Math.round(score * 1.2 + (pick.volume_ratio > 1.5 ? 10 : 0)));
            const rating = ratingFromScore(score);

            return (
              <motion.div
                key={pick.symbol}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <Link
                  href={`/stock/${pick.symbol}`}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
                >
                  {/* Rank */}
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-ink-500/25 text-[10px] font-semibold text-ink-500 group-hover:border-crimson-400/40 group-hover:text-crimson-300 transition-colors tabular-nums">
                    {i + 1}
                  </span>

                  {/* Symbol */}
                  <span className="font-mono text-[12px] font-bold text-ink-100 tracking-tight min-w-[55px] group-hover:text-crimson-300 transition-colors">
                    {pick.symbol}
                  </span>

                  {/* Confidence bar */}
                  <div className="flex flex-1 items-center gap-1.5">
                    <div className="relative h-[4px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-700",
                          confidenceColor(score)
                        )}
                        style={{ width: `${confidence}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-ink-500 min-w-[24px] text-right tabular-nums">
                      {confidence}%
                    </span>
                  </div>

                  {/* Rating pill */}
                  <span
                    className={cn(
                      "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      rating.color,
                      rating.bg
                    )}
                  >
                    {rating.label}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
