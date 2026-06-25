"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Hash, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function formatMentions(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function sentimentEmoji(attention: number, sentiment: number): string {
  if (attention > 70 && sentiment > 0.5) return "\u{1F525}";
  if (sentiment > 0.3) return "\u{1F4C8}";
  if (sentiment < -0.2) return "\u{1F4C9}";
  return "\u{1F4A4}";
}

export function TrendingSocial() {
  const { data, isLoading } = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 5 * 60 * 1000,
  });

  const items = [...(data ?? [])]
    .sort((a: any, b: any) => (b.attention_score ?? 0) - (a.attention_score ?? 0))
    .slice(0, 10);

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Trending on Social"
      subtitle="Reddit & social buzz"
      icon={<Hash size={14} className="text-crimson-400" />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-500 py-8 text-center">No trending data</p>
      ) : (
        <div className="space-y-0.5">
          {items.map((t: any, i: number) => {
            const isPositive = (t.growth_rate ?? 0) >= 0;
            const emoji = sentimentEmoji(t.attention_score ?? 0, t.sentiment_score ?? 0);

            return (
              <motion.div
                key={t.symbol}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Link
                  href={`/stock/${t.symbol}`}
                  className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors"
                >
                  {/* Rank badge */}
                  <span
                    className={cn(
                      "flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold font-mono",
                      i === 0
                        ? "bg-crimson-600/20 text-crimson-400"
                        : i <= 2
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-white/5 text-ink-500"
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Symbol */}
                  <span className="font-mono text-xs font-bold text-ink-100 group-hover:text-crimson-400 transition-colors min-w-[48px]">
                    {t.symbol}
                  </span>

                  {/* Mentions */}
                  <span className="text-[10px] text-ink-500 font-mono min-w-[36px] text-right">
                    {formatMentions(t.mention_volume ?? 0)}
                  </span>

                  {/* Growth rate */}
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-[10px] font-mono font-medium flex-1 justify-end",
                      isPositive ? "text-emerald-400" : "text-crimson-400"
                    )}
                  >
                    {isPositive ? (
                      <ArrowUpRight size={10} />
                    ) : (
                      <ArrowDownRight size={10} />
                    )}
                    {Math.abs(t.growth_rate ?? 0).toFixed(0)}%
                  </div>

                  {/* Sentiment emoji */}
                  <span className="text-sm flex-shrink-0" title={`Sentiment: ${(t.sentiment_score ?? 0).toFixed(2)}`}>
                    {emoji}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
