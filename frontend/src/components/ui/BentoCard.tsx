"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** "Fetched 3m ago" — when this browser last got the data (not the quote time). */
function Freshness({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="whitespace-nowrap text-[10px] text-ink-500"
      title={`Fetched ${new Date(at).toLocaleTimeString()}. Free market data is delayed ~15 min.`}
    >
      {ago(at, now)}
    </span>
  );
}

export function BentoCard({
  title, subtitle, span = "col-span-12 md:col-span-6", children, action, className, icon, updatedAt,
}: {
  title?: string; subtitle?: string; span?: string;
  children: React.ReactNode; action?: React.ReactNode; className?: string; icon?: React.ReactNode;
  /** Epoch ms of the last successful fetch (react-query's dataUpdatedAt). */
  updatedAt?: number;
}) {
  const showFresh = !!updatedAt;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("glass glass-hover flex min-w-0 flex-col p-4 sm:p-5", span, className)}
    >
      {(title || action || showFresh) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">{icon}{title}</h3>}
            {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
            {showFresh && !action && <Freshness at={updatedAt!} />}
          </div>
          {action ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              {action}
              {showFresh && <Freshness at={updatedAt!} />}
            </div>
          ) : null}
        </div>
      )}
      {/* flex-1 lets card content fill the row height instead of leaving a gap or overflowing */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.section>
  );
}
