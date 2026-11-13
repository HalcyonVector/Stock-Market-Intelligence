"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function PulseRadar() {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="relative flex h-16 w-16 items-center justify-center">
        {/* Outer pulse rings */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-crimson-500/20"
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{
              duration: 2.5,
              delay: i * 0.8,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
        {/* Center dot */}
        <motion.div
          className="h-3 w-3 rounded-full bg-crimson-400"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <p className="mt-4 text-xs tracking-wide text-ink-500">
        Listening for activity...
      </p>
    </div>
  );
}

/** Plain-English reason for an unusual-activity event. */
function describe(d: any): string {
  const ch = typeof d.change_pct === "number" ? d.change_pct : 0;
  const vr = typeof d.volume_ratio === "number" ? d.volume_ratio : null;
  const move = Math.abs(ch) >= 5 ? (ch >= 0 ? "Sharp rise" : "Sharp drop") : "Volume spike";
  return vr && vr >= 1.5 ? `${move} · ${vr.toFixed(1)}x usual volume` : move;
}

const MAX_ROWS = 8;

export function LiveFeed() {
  const { events, connected } = useLiveFeed();
  const market = useMarket();
  // Shares the dashboard's cached movers query, so filling the card costs no
  // extra request.
  const { data: movers } = useQuery({ queryKey: ["movers", market], queryFn: () => api.movers(market) });
  const visible = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((e) => {
      const key = e.data.symbol ?? e.channel;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_ROWS);
  }, [events]);

  // When the feed is quiet, fill the card with the day's biggest movers that
  // haven't already appeared as events.
  const alsoMoving = useMemo(() => {
    const shown = new Set(visible.map((e) => e.data.symbol));
    const all = [...(movers?.gainers ?? []), ...(movers?.losers ?? [])]
      .filter((q: any) => q?.symbol && !shown.has(q.symbol))
      .sort((a: any, b: any) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
    return all.slice(0, Math.max(0, MAX_ROWS - visible.length));
  }, [movers, visible]);

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Unusual Activity Feed"
      icon={<Activity size={16} className="text-ink-500" />}
      action={
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {connected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="uppercase tracking-widest text-emerald-400">Live</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-ink-500" />
              <span className="uppercase tracking-widest text-ink-500">Offline</span>
            </>
          )}
        </span>
      }
    >
      {visible.length === 0 && alsoMoving.length === 0 ? (
        <PulseRadar />
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visible.map((e, i) => {
              const changePct = e.data.change_pct;
              const isPositive = typeof changePct === "number" && changePct >= 0;
              const isNegative = typeof changePct === "number" && changePct < 0;

              return (
                <motion.div
                  key={`${e.receivedAt}-${i}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={cn(
                    "group flex items-stretch gap-0 rounded-xl",
                    "border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm",
                    "transition-colors duration-150 hover:bg-white/[0.05]",
                  )}
                >
                  {/* Colored accent line */}
                  <div
                    className={cn(
                      "w-[3px] shrink-0 rounded-l-xl",
                      isNegative ? "bg-crimson-400" : isPositive ? "bg-emerald-400" : "bg-ink-500",
                    )}
                  />

                  <div className="flex flex-1 items-center justify-between px-3 py-2.5">
                    <Link href={`/stock/${e.data.symbol}`} className="min-w-0">
                      <span className="block font-mono text-sm font-bold tracking-tight text-ink-100">
                        {e.data.symbol ?? e.channel}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500">{describe(e.data)}</span>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2.5">
                      {typeof changePct === "number" && (
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                            isPositive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-crimson-500/15 text-crimson-300",
                          )}
                        >
                          {isPositive ? "+" : ""}{changePct.toFixed(2)}%
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums text-ink-500">
                        {relativeTime(e.receivedAt)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {alsoMoving.length > 0 && (
            <>
              <p className="px-1 pt-2 text-[10px] uppercase tracking-wide text-ink-500">
                {visible.length ? "Also moving today" : "Quiet feed · biggest moves today"}
              </p>
              {alsoMoving.map((q: any) => {
                const up = q.change_pct >= 0;
                const vr = q.avg_volume ? q.volume / q.avg_volume : null;
                return (
                  <Link key={q.symbol} href={`/stock/${q.symbol}`}
                    className="flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-white/[0.04]">
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-ink-200">{q.symbol}</span>
                      {vr && vr >= 1.2 && <span className="ml-2 text-[10px] text-ink-500">{vr.toFixed(1)}x vol</span>}
                    </span>
                    <span className={cn("font-mono text-[11px]", up ? "text-emerald-300" : "text-crimson-300")}>
                      {up ? "+" : ""}{q.change_pct.toFixed(2)}%
                    </span>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      )}
    </BentoCard>
  );
}
