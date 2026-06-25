"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function sentimentBadge(score: number) {
  if (score > 0.15) return { emoji: "🟢", label: "Bullish", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20" };
  if (score < -0.15) return { emoji: "🔴", label: "Bearish", cls: "bg-crimson-600/15 text-crimson-300 ring-crimson-500/20" };
  return { emoji: "⚪", label: "Neutral", cls: "bg-white/5 text-ink-300 ring-white/10" };
}

export function SentimentTrends() {
  const { data } = useQuery({ queryKey: ["trending"], queryFn: () => api.trending() });
  const sorted = [...(data ?? [])].sort((a: any, b: any) => (b.mention_volume ?? 0) - (a.mention_volume ?? 0));
  const maxVolume = sorted.length > 0 ? Math.max(...sorted.map((r: any) => r.mention_volume ?? 0)) : 1;

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Retail Sentiment"
      subtitle="Attention & tone shifts"
      icon={<TrendingUp size={16} className="text-ink-500" />}
    >
      <ul className="space-y-1.5">
        {sorted.slice(0, 8).map((r: any, i: number) => {
          const badge = sentimentBadge(r.sentiment_score);
          const barWidth = maxVolume > 0 ? ((r.mention_volume ?? 0) / maxVolume) * 100 : 0;

          // Bar gradient: crimson-to-emerald mapped by sentiment (-1 to 1)
          const normalizedSentiment = Math.max(-1, Math.min(1, r.sentiment_score));
          const barColor =
            normalizedSentiment > 0.15
              ? "from-emerald-600/40 to-emerald-400/60"
              : normalizedSentiment < -0.15
                ? "from-crimson-600/40 to-crimson-400/60"
                : "from-ink-500/30 to-ink-300/40";

          return (
            <motion.li
              key={r.symbol}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: "easeOut" }}
            >
              <Link
                href={`/stock/${r.symbol}`}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.04]"
              >
                {/* Symbol */}
                <span className="w-16 shrink-0 font-mono text-xs font-bold tracking-tight text-ink-100">
                  {r.symbol}
                </span>

                {/* Volume bar */}
                <div className="relative flex-1">
                  <div className="h-1.5 w-full rounded-full bg-white/[0.04]">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", barColor)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="mt-0.5 block text-[10px] tabular-nums text-ink-500">
                    {(r.mention_volume ?? 0).toLocaleString()} mentions
                  </span>
                </div>

                {/* Sentiment badge */}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                    badge.cls,
                  )}
                >
                  {badge.emoji} {badge.label}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </BentoCard>
  );
}
