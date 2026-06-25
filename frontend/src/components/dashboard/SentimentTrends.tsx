"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export function SentimentTrends() {
  const { data } = useQuery({ queryKey: ["trending"], queryFn: () => api.trending() });
  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Retail Sentiment" subtitle="Attention & tone shifts">
      <ul className="space-y-2">
        {(data ?? []).slice(0, 7).map((r: any) => (
          <li key={r.symbol}>
            <Link href={`/stock/${r.symbol}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
              <span className="font-mono text-sm">{r.symbol}</span>
              <span className="flex items-center gap-3 text-xs">
                <span className="text-ink-500">{r.mention_volume?.toLocaleString()} mentions</span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 font-mono",
                  r.sentiment_score > 0.15 ? "bg-emerald-500/15 text-emerald-300"
                    : r.sentiment_score < -0.15 ? "bg-crimson-600/20 text-crimson-300"
                    : "bg-white/5 text-ink-300"
                )}>
                  {r.sentiment_score > 0 ? "+" : ""}{r.sentiment_score}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}
