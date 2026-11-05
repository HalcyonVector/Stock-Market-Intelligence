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
const ROWS = 8;

function formatVol(v: number): string {
  if (!v) return "0";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

const volRatioOf = (q: any) => (q.avg_volume ? q.volume / q.avg_volume : 0);

function Row({ q, index, tab, scaleMax }: { q: any; index: number; tab: Tab; scaleMax: number }) {
  const change = q.change_pct ?? 0;
  const up = change >= 0;
  const ratio = volRatioOf(q);
  // Bar = this row's size relative to the biggest in the list: % move for
  // Gainers/Losers, volume-vs-average for the Volume tab.
  const magnitude = tab === "volume" ? ratio : Math.abs(change);
  const width = scaleMax > 0 ? Math.max(6, (magnitude / scaleMax) * 100) : 0;
  const barTone =
    tab === "volume"
      ? "from-sky-500/70 to-sky-400/40"
      : up
        ? "from-emerald-500/70 to-emerald-400/40"
        : "from-crimson-500/70 to-crimson-400/40";

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
    >
      <Link
        href={`/stock/${q.symbol}`}
        className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] font-semibold tracking-tight text-ink-100" title={q.symbol}>
            {q.symbol}
          </p>
          <p className="truncate text-[10px] tabular-nums text-ink-500">
            {money(q.price, q.currency ?? q.symbol)}
            {ratio > 0 && <span className="ml-1.5">· {ratio.toFixed(1)}x vol</span>}
          </p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${width}%` }}
            transition={{ duration: 0.5, delay: 0.1 + index * 0.03, ease: "easeOut" }}
            className={cn("h-full rounded-full bg-gradient-to-r", barTone)}
          />
        </div>

        <div className="flex flex-col items-end">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
              up ? "bg-emerald-500/15 text-emerald-400" : "bg-crimson-500/15 text-crimson-400"
            )}
          >
            {pct(change)}
          </span>
          {tab === "volume" && (
            <span className="mt-0.5 font-mono text-[9px] text-ink-500">{formatVol(q.volume)}</span>
          )}
        </div>
      </Link>
    </motion.li>
  );
}

function Summary({ tab, rows }: { tab: Tab; rows: any[] }) {
  if (!rows.length) return null;
  const avg = rows.reduce((s, q) => s + (q.change_pct ?? 0), 0) / rows.length;
  const top = rows[0];
  const items =
    tab === "volume"
      ? [
          { k: "Busiest", v: top.symbol },
          { k: "Avg vs normal", v: `${(rows.reduce((s, q) => s + volRatioOf(q), 0) / rows.length).toFixed(1)}x` },
          { k: "Up / down", v: `${rows.filter((q) => q.change_pct >= 0).length} / ${rows.filter((q) => q.change_pct < 0).length}` },
        ]
      : [
          { k: tab === "gainers" ? "Top gainer" : "Top loser", v: top.symbol },
          { k: "Average move", v: pct(avg) },
          {
            k: "Range",
            v: `${pct(Math.min(...rows.map((q) => q.change_pct ?? 0)))} … ${pct(Math.max(...rows.map((q) => q.change_pct ?? 0)))}`,
          },
        ];
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="text-[9px] uppercase tracking-wider text-ink-500">{i.k}</dt>
          <dd className="truncate font-mono text-[11px] text-ink-200">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MoversList() {
  const market = useMarket();
  const [tab, setTab] = useState<Tab>("gainers");
  const { data, dataUpdatedAt, isError, refetch } = useQuery({ queryKey: ["movers", market], queryFn: () => api.movers(market) });

  const source: any[] =
    tab === "gainers" ? data?.gainers ?? [] : tab === "losers" ? data?.losers ?? [] : data?.most_active ?? [];
  const rows = source.slice(0, ROWS);
  const scaleMax = Math.max(0, ...rows.map((q) => (tab === "volume" ? volRatioOf(q) : Math.abs(q.change_pct ?? 0))));

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()}
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
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-xs text-ink-500">No data yet.</p>
      ) : (
        <>
          {/* justify-between spreads rows over the available height */}
          <ul role="tabpanel" className="flex flex-1 flex-col justify-between gap-0.5">
            {rows.map((q, i) => (
              <Row key={`${tab}-${q.symbol}`} q={q} index={i} tab={tab} scaleMax={scaleMax} />
            ))}
          </ul>
          <Summary tab={tab} rows={rows} />
        </>
      )}
    </BentoCard>
  );
}
