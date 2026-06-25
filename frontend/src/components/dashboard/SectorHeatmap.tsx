"use client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function tileColor(momentum: number) {
  if (momentum >= 60) return { border: "border-l-emerald-400", bg: "bg-emerald-500/8", text: "text-emerald-300", glow: "hover:shadow-emerald-500/10" };
  if (momentum >= 45) return { border: "border-l-amber-400", bg: "bg-amber-500/8", text: "text-amber-300", glow: "hover:shadow-amber-500/10" };
  return { border: "border-l-crimson-400", bg: "bg-crimson-500/8", text: "text-crimson-300", glow: "hover:shadow-crimson-500/10" };
}

function formatFlow(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function SectorHeatmap() {
  const { data } = useQuery({ queryKey: ["sectors"], queryFn: () => api.sectors() });
  const sectors = data ?? [];

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Sector Rotation"
      subtitle="Momentum & net institutional flow"
      icon={<Layers size={16} className="text-ink-500" />}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {sectors.map((s: any, i: number) => {
          const c = tileColor(s.momentum);
          const isInflow = s.direction === "inflow";
          return (
            <motion.div
              key={s.sector}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
              className={cn(
                "group relative rounded-xl border border-white/[0.06] border-l-[3px] p-3.5",
                "cursor-default transition-all duration-200",
                "hover:scale-[1.03] hover:shadow-lg",
                c.border, c.bg, c.glow,
              )}
            >
              {/* Gradient overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent" />

              <p className="relative truncate text-[11px] font-medium tracking-wide text-ink-300 uppercase">
                {s.sector}
              </p>

              <div className="relative mt-1.5 flex items-baseline gap-1.5">
                <span className={cn("font-mono text-xl font-bold tracking-tight", c.text)}>
                  {s.momentum}
                </span>
                {isInflow ? (
                  <ArrowUpRight size={14} className="text-emerald-400" />
                ) : (
                  <ArrowDownRight size={14} className="text-crimson-400" />
                )}
              </div>

              <p className="relative mt-1 font-mono text-[10px] text-ink-500">
                {isInflow ? "+" : ""}{formatFlow(s.net_flow)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
