"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { pct, changeColor, cn } from "@/lib/utils";

function barColor(score: number) {
  if (score >= 70) return "from-emerald-500 to-emerald-400";
  if (score >= 45) return "from-amber-500 to-amber-400";
  return "from-crimson-500 to-crimson-400";
}

function OpportunityRow({ r, rank }: { r: any; rank: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.05 }}
    >
      <Link
        href={`/stock/${r.symbol}`}
        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-200 hover:bg-white/[0.04]"
      >
        {/* Rank badge */}
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-ink-500/30 text-[10px] font-semibold tabular-nums text-ink-500 group-hover:border-crimson-400/40 group-hover:text-crimson-300 transition-colors">
          {rank}
        </span>

        {/* Symbol + change */}
        <div className="flex flex-col min-w-[52px]">
          <span className="font-mono text-[13px] font-semibold text-ink-100 tracking-tight">
            {r.symbol}
          </span>
          <span className={cn("text-[10px] tabular-nums", changeColor(r.change_pct))}>
            {pct(r.change_pct)}
          </span>
        </div>

        {/* Progress bar + score */}
        <div className="flex flex-1 items-center gap-2">
          <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-500",
                barColor(r.opportunity)
              )}
              style={{ width: `${Math.min(r.opportunity, 100)}%` }}
            />
          </div>
          <span className="min-w-[22px] text-right font-mono text-[11px] font-semibold tabular-nums text-ink-300">
            {r.opportunity}
          </span>
        </div>
      </Link>
    </motion.li>
  );
}

export function OpportunityRadar() {
  const { data } = useQuery({ queryKey: ["discovery"], queryFn: () => api.discovery() });
  const rows = (data ?? []).slice(0, 8);

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Opportunity Radar"
      subtitle="Ranked by composite score"
    >
      <ul className="space-y-0.5">
        {rows.map((r: any, i: number) => (
          <OpportunityRow key={r.symbol} r={r} rank={i + 1} />
        ))}
        {rows.length === 0 && (
          <p className="px-2 py-4 text-xs text-ink-500">Loading discovery scan...</p>
        )}
      </ul>
    </BentoCard>
  );
}
