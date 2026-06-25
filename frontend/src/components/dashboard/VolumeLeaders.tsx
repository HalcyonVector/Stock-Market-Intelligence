"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { changeColor, pct, cn } from "@/lib/utils";

function formatVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

export function VolumeLeaders() {
  const { data } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const rows = (data?.most_active ?? []).slice(0, 6);

  return (
    <BentoCard span="col-span-6 lg:col-span-3" title="Volume Leaders">
      <div className="space-y-1.5">
        {rows.map((q: any, i: number) => {
          const volRatio = q.avg_volume ? q.volume / q.avg_volume : 1;
          const barWidth = Math.min(100, volRatio * 40);
          const isPositive = q.change_pct >= 0;

          return (
            <motion.div
              key={q.symbol}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35 }}
            >
              <Link
                href={`/stock/${q.symbol}`}
                className={cn(
                  "group relative flex flex-col gap-1 rounded-xl px-3 py-1.5",
                  "transition-all duration-200",
                  "hover:bg-white/[0.06] hover:scale-[1.01]",
                  "hover:shadow-[0_0_20px_rgba(255,255,255,0.03)]"
                )}
              >
                {/* Row 1: Symbol + Change badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-bold text-ink-100 tracking-wide">
                    {q.symbol}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                      isPositive
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-crimson-500/10 text-crimson-400 border border-crimson-500/20",
                    )}
                  >
                    {pct(q.change_pct)}
                  </span>
                </div>

                {/* Row 2: Volume bar with labels */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-300 font-medium min-w-[36px]">
                    {formatVol(q.volume)}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${barWidth}%` }}
                      transition={{ delay: i * 0.06 + 0.2, duration: 0.6, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full transition-all",
                        isPositive
                          ? "bg-gradient-to-r from-emerald-500/60 to-emerald-400/40"
                          : "bg-gradient-to-r from-crimson-500/60 to-crimson-400/40"
                      )}
                      style={{
                        boxShadow: isPositive
                          ? "0 0 12px rgba(52, 211, 153, 0.2)"
                          : "0 0 12px rgba(255, 59, 92, 0.2)",
                      }}
                    />
                  </div>
                  {q.avg_volume > 0 && (
                    <span className="text-[9px] text-ink-500 font-mono min-w-[40px] text-right">
                      {volRatio.toFixed(1)}x avg
                    </span>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
