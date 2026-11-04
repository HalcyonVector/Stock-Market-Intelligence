"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
import { BentoCard } from "@/components/ui/BentoCard";
import { pct, cn, money } from "@/lib/utils";

type Tab = "gainers" | "losers" | "volume";
const TABS: { id: Tab; label: string }[] = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "volume", label: "Volume" },
];

function formatVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v ?? 0);
}

function ChangeBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex min-w-[64px] items-center justify-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        up ? "bg-emerald-500/15 text-emerald-400" : "bg-crimson-500/15 text-crimson-400"
      )}
    >
      {pct(value ?? 0)}
    </span>
  );
}

function MoverRow({ q, index }: { q: any; index: number }) {
  // Volume relative to its average, shown as a bar (real data, unlike the
  // random sparkline this card used to draw).
  const volRatio = q.avg_volume ? q.volume / q.avg_volume : null;
  const up = (q.change_pct ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        href={`/stock/${q.symbol}`}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
          "border-b border-white/[0.04] last:border-b-0",
          up ? "hover:bg-emerald-500/[0.06]" : "hover:bg-crimson-500/[0.06]"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-[13px] font-semibold tracking-tight text-ink-100">{q.symbol}</span>
          <span className="text-[11px] tabular-nums text-ink-500">{money(q.price, q.symbol)}</span>
        </span>
        <span className="flex items-center gap-3">
          {volRatio != null && (
            <span
              className="hidden font-mono text-[10px] text-ink-500 sm:inline"
              title={`Volume ${formatVol(q.volume)} vs ${formatVol(q.avg_volume)} average`}
            >
              {volRatio.toFixed(1)}x vol
            </span>
          )}
          <ChangeBadge value={q.change_pct} />
        </span>
      </Link>
    </motion.div>
  );
}

function VolumeRow({ q, index }: { q: any; index: number }) {
  const volRatio = q.avg_volume ? q.volume / q.avg_volume : 1;
  const up = (q.change_pct ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
    >
      <Link
        href={`/stock/${q.symbol}`}
        className="flex flex-col gap-1 rounded-xl px-3 py-1.5 transition hover:bg-white/[0.06]"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px] font-bold tracking-wide text-ink-100">{q.symbol}</span>
          <ChangeBadge value={q.change_pct} />
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[40px] text-[10px] font-medium text-ink-300">{formatVol(q.volume)}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, volRatio * 40)}%` }}
              transition={{ delay: index * 0.04 + 0.15, duration: 0.5, ease: "easeOut" }}
              className={cn(
                "h-full rounded-full",
                up ? "bg-gradient-to-r from-emerald-500/60 to-emerald-400/40" : "bg-gradient-to-r from-crimson-500/60 to-crimson-400/40"
              )}
            />
          </div>
          {q.avg_volume > 0 && (
            <span className="min-w-[48px] text-right font-mono text-[9px] text-ink-500">{volRatio.toFixed(1)}x avg</span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export function MoversList() {
  const market = useMarket();
  const [tab, setTab] = useState<Tab>("gainers");
  const { data, dataUpdatedAt } = useQuery({ queryKey: ["movers", market], queryFn: () => api.movers(market) });

  const rows: any[] =
    tab === "gainers" ? data?.gainers ?? [] : tab === "losers" ? data?.losers ?? [] : data?.most_active ?? [];

  return (
    <BentoCard
      updatedAt={dataUpdatedAt}
      span="col-span-12 lg:col-span-4"
      title="Market Movers"
      action={
        <div role="tablist" aria-label="Movers view" className="flex rounded-lg bg-white/5 p-0.5 text-[11px]">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-2 py-1 transition",
                tab === t.id ? "bg-white/10 text-ink-100" : "text-ink-500 hover:text-ink-300"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div role="tabpanel">
        {rows.length === 0 && <p className="px-3 py-6 text-center text-xs text-ink-500">No data yet.</p>}
        {rows.slice(0, 8).map((q, i) =>
          tab === "volume" ? <VolumeRow key={q.symbol} q={q} index={i} /> : <MoverRow key={q.symbol} q={q} index={i} />
        )}
      </div>
    </BentoCard>
  );
}
