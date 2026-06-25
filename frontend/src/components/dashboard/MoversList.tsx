"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { Sparkline } from "@/components/ui/Sparkline";
import { pct, cn } from "@/lib/utils";

function generateMiniTrend(changePct: number): number[] {
  const points: number[] = [];
  let val = 100;
  for (let i = 0; i < 12; i++) {
    val += (changePct / 12) + (Math.random() - 0.5) * Math.abs(changePct) * 0.3;
    points.push(val);
  }
  return points;
}

function MoverRow({ q, index, direction }: { q: any; index: number; direction: "up" | "down" }) {
  const trend = generateMiniTrend(q.change_pct);
  const isPositive = direction === "up";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link
        href={`/stock/${q.symbol}`}
        className={cn(
          "group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-200",
          "border-b border-white/[0.04] last:border-b-0",
          isPositive
            ? "hover:bg-emerald-500/[0.06] hover:shadow-[inset_0_0_20px_rgba(16,185,129,0.04)]"
            : "hover:bg-crimson-500/[0.06] hover:shadow-[inset_0_0_20px_rgba(220,38,38,0.04)]"
        )}
      >
        <span className="flex items-center gap-3">
          <span className="font-mono font-semibold text-ink-100 text-[13px] tracking-tight">
            {q.symbol}
          </span>
          <span className="text-[11px] text-ink-500 tabular-nums">
            ${q.price?.toFixed(2)}
          </span>
        </span>

        <span className="flex items-center gap-3">
          <Sparkline data={trend} width={60} height={18} />
          <span
            className={cn(
              "inline-flex min-w-[58px] items-center justify-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
              isPositive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-crimson-500/15 text-crimson-400"
            )}
          >
            {pct(q.change_pct)}
          </span>
        </span>
      </Link>
    </motion.div>
  );
}

function Section({
  title,
  rows,
  direction,
}: {
  title: string;
  rows: any[];
  direction: "up" | "down";
}) {
  const dotColor = direction === "up" ? "bg-emerald-400" : "bg-crimson-400";

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">
          {title}
        </p>
      </div>
      <div>
        {rows.map((q, i) => (
          <MoverRow key={q.symbol} q={q} index={i} direction={direction} />
        ))}
      </div>
    </div>
  );
}

export function MoversList() {
  const { data } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Live Market Movers">
      <div className="space-y-3">
        <Section title="Gainers" rows={(data?.gainers ?? []).slice(0, 5)} direction="up" />
        <Section title="Losers" rows={(data?.losers ?? []).slice(0, 5)} direction="down" />
      </div>
    </BentoCard>
  );
}
