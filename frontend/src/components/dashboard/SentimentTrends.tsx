"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function sentimentBadge(score: number) {
  if (score > 0.15) return { emoji: "🟢", label: "Bullish", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20" };
  if (score < -0.15) return { emoji: "🔴", label: "Bearish", cls: "bg-crimson-600/15 text-crimson-300 ring-crimson-500/20" };
  return { emoji: "⚪", label: "Neutral", cls: "bg-white/5 text-ink-300 ring-white/10" };
}

export function SentimentTrends() {
  const market = useMarket();
  const { data, dataUpdatedAt, isError, refetch } = useQuery({ queryKey: ["trending", market], queryFn: () => api.trending(market) });
  const sorted = [...(data ?? [])].sort((a: any, b: any) => (b.mention_volume ?? 0) - (a.mention_volume ?? 0));
  const maxVolume = sorted.length > 0 ? Math.max(...sorted.map((r: any) => r.mention_volume ?? 0)) : 1;

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()} updatedAt={dataUpdatedAt}
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
                  <span className="mt-0.5 block truncate text-[10px] tabular-nums text-ink-500">
                    {(r.mention_volume ?? 0).toLocaleString()} mentions
                    {typeof r.growth_rate === "number" && r.growth_rate !== 0 && (
                      <span title="Change in attention vs its usual level" className={r.growth_rate > 0 ? "text-amber-300/80" : "text-ink-500"}>
                        {" "}· {r.growth_rate > 0 ? "+" : ""}{Math.round(r.growth_rate)}%
                      </span>
                    )}
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
        {sorted.length === 0 && (
          <p className="px-2 py-4 text-xs text-ink-500">Gathering sentiment data...</p>
        )}
      </ul>
      {sorted.length > 0 && <ToneSummary rows={sorted} />}
    </BentoCard>
  );
}

/** Fills the rest of the card with what the rows add up to: the tone mix,
 *  the loudest and fastest-rising names, and where the numbers come from. */
function ToneSummary({ rows }: { rows: any[] }) {
  const bull = rows.filter((r) => r.sentiment_score > 0.15).length;
  const bear = rows.filter((r) => r.sentiment_score < -0.15).length;
  const neutral = rows.length - bull - bear;
  const total = rows.reduce((a, r) => a + (r.mention_volume ?? 0), 0);
  const rising = [...rows].sort((a, b) => (b.growth_rate ?? 0) - (a.growth_rate ?? 0))[0];
  const avg = rows.reduce((a, r) => a + (r.sentiment_score ?? 0), 0) / rows.length;
  const pctOf = (n: number) => `${(n / rows.length) * 100}%`;
  const mood = avg > 0.15 ? "leaning bullish" : avg < -0.15 ? "leaning bearish" : "mixed";

  return (
    <div className="mt-auto space-y-3 border-t border-white/5 pt-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-500">
          <span>Tone across {rows.length} trending names</span>
          <span className="normal-case tracking-normal text-ink-400">{mood}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/5" aria-label={`${bull} bullish, ${neutral} neutral, ${bear} bearish`}>
          <div className="bg-emerald-500/60" style={{ width: pctOf(bull) }} />
          <div className="bg-ink-400/40" style={{ width: pctOf(neutral) }} />
          <div className="bg-crimson-500/60" style={{ width: pctOf(bear) }} />
        </div>
        <div className="mt-1 flex gap-3 text-[10px] text-ink-500">
          <span><span className="text-emerald-300">{bull}</span> bullish</span>
          <span><span className="text-ink-300">{neutral}</span> neutral</span>
          <span><span className="text-crimson-300">{bear}</span> bearish</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
          <dt className="text-ink-500">Total mentions</dt>
          <dd className="font-mono text-sm text-ink-100">{total.toLocaleString()}</dd>
        </div>
        {rising && (
          <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
            <dt className="text-ink-500">Fastest rising</dt>
            <dd className="font-mono text-sm text-ink-100">
              {rising.symbol}{" "}
              <span className="text-[11px] text-amber-300/80">+{Math.round(rising.growth_rate ?? 0)}%</span>
            </dd>
          </div>
        )}
      </dl>
      <p className="text-[10px] leading-relaxed text-ink-500">
        From StockTwits, Reddit and Google Trends. Only stocks with enough chatter to score are listed;
        attention often spikes after a big move, not before it.
      </p>
    </div>
  );
}
