"use client";
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useLiveFeed } from "@/hooks/useLiveFeed";
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

export function LiveFeed() {
  const { events, connected } = useLiveFeed();
  const visible = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((e) => {
      const key = e.data.symbol ?? e.channel;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [events]);

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
      {visible.length === 0 ? (
        <PulseRadar />
      ) : (
        <div className="max-h-[22rem] space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
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
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold tracking-tight text-ink-100">
                        {e.data.symbol ?? e.channel}
                      </span>
                      <span className="ml-2 text-[11px] text-ink-500">
                        {e.data.type ?? "tick"}
                      </span>
                    </div>

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
        </div>
      )}
    </BentoCard>
  );
}
