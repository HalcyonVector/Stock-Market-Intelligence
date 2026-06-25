"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export function LiveFeed() {
  const { events, connected } = useLiveFeed();
  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Unusual Activity Feed"
      action={
        <span className={cn("flex items-center gap-1 text-xs",
          connected ? "text-emerald-400" : "text-ink-500")}>
          <Radio size={12} className={connected ? "animate-pulseGlow" : ""} />
          {connected ? "live" : "offline"}
        </span>
      }
    >
      <div className="max-h-64 space-y-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {events.map((e, i) => (
            <motion.div key={e.receivedAt + i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs">
              <span className="font-mono text-crimson-300">{e.data.symbol ?? e.channel}</span>{" "}
              <span className="text-ink-300">
                {e.data.type ?? "tick"} {e.data.change_pct ? `${e.data.change_pct}%` : ""}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {events.length === 0 && (
          <p className="text-xs text-ink-500">
            Waiting for live events… (start the backend + worker to stream)
          </p>
        )}
      </div>
    </BentoCard>
  );
}
