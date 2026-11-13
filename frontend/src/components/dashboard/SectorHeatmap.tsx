"use client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function tileColor(momentum: number) {
  if (momentum >= 60) return { border: "border-l-emerald-400", bg: "bg-emerald-500/8", text: "text-emerald-300", glow: "hover:shadow-emerald-500/10" };
  if (momentum >= 45) return { border: "border-l-amber-400", bg: "bg-amber-500/8", text: "text-amber-300", glow: "hover:shadow-amber-500/10" };
  return { border: "border-l-crimson-400", bg: "bg-crimson-500/8", text: "text-crimson-300", glow: "hover:shadow-crimson-500/10" };
}


export function SectorHeatmap() {
  const market = useMarket();
  const { data, dataUpdatedAt, isError, refetch } = useQuery({ queryKey: ["sectors", market], queryFn: () => api.sectors(market) });
  const sectors = (data ?? []).slice(0, 9);

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()} updatedAt={dataUpdatedAt}
      span="col-span-12 lg:col-span-4"
      title="Sector Rotation"
      subtitle="Momentum score · today's average move · stocks up"
      icon={<Layers size={16} className="text-ink-500" />}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {sectors.map((s: any, i: number) => {
          const c = tileColor(s.momentum);
          const up = (s.avg_change ?? 0) >= 0;
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
                {up ? (
                  <ArrowUpRight size={14} className="text-emerald-400" aria-hidden />
                ) : (
                  <ArrowDownRight size={14} className="text-crimson-400" aria-hidden />
                )}
              </div>

              <p className="relative mt-1 flex flex-col font-mono text-[10px] leading-tight text-ink-500"
                title={`${s.advancers ?? 0} of ${s.constituents} stocks up today; momentum is a 0-100 score from recent price trend`}>
                <span className={up ? "text-emerald-300/80" : "text-crimson-300/80"}>
                  {up ? "+" : ""}{(s.avg_change ?? 0).toFixed(2)}%
                </span>
                <span>{s.advancers ?? 0}/{s.constituents} up</span>
              </p>
            </motion.div>
          );
        })}
      </div>
    </BentoCard>
  );
}
