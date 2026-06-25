"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, Rss, TrendingUp, MessageCircle, ExternalLink, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function NewsFeed() {
  const { data, isLoading } = useQuery({ queryKey: ["news"], queryFn: () => api.news(30) });
  return (
    <BentoCard span="col-span-12 lg:col-span-8" title="Live News Feed" subtitle="Aggregated market news">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-ink-500" />
        </div>
      ) : (
        <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
          {(data ?? []).map((n: any, i: number) => (
            <a
              key={i}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-lg border border-white/[0.03] bg-black/10 p-3 transition hover:border-crimson-500/20 hover:bg-white/[0.02]"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-ink-100 group-hover:text-crimson-300 transition">
                  {n.headline}
                </h4>
                <ExternalLink size={12} className="mt-1 shrink-0 text-ink-700 group-hover:text-crimson-400" />
              </div>
              {n.summary && <p className="mt-1 text-xs text-ink-500 line-clamp-2">{n.summary}</p>}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-ink-500">
                <span className="flex items-center gap-1">
                  <Rss size={10} /> {n.source}
                </span>
                {n.symbol && (
                  <span className="rounded bg-crimson-600/10 px-1.5 py-0.5 font-mono text-crimson-300">
                    {n.symbol}
                  </span>
                )}
                <span>{new Date(n.published_at).toLocaleDateString()}</span>
              </div>
            </a>
          ))}
          {(!data || data.length === 0) && (
            <p className="py-8 text-center text-xs text-ink-500">No news available. Make sure the backend is running.</p>
          )}
        </div>
      )}
    </BentoCard>
  );
}

function SentimentRadar() {
  const { data, isLoading } = useQuery({ queryKey: ["trending"], queryFn: () => api.trending() });
  const [page, setPage] = useState(0);
  const perPage = 5;
  const all = data ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));
  const slice = all.slice(page * perPage, (page + 1) * perPage);

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Social Buzz" subtitle="Attention & sentiment across tickers">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-ink-500" />
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="space-y-2 min-h-[420px]">
            {slice.map((r: any) => {
              const sentColor = r.sentiment_score > 0.15
                ? "text-emerald-400 bg-emerald-500/10"
                : r.sentiment_score < -0.15
                  ? "text-crimson-400 bg-crimson-600/10"
                  : "text-ink-300 bg-white/5";
              const attBar = Math.min(100, r.attention_score ?? 0);
              return (
                <div key={r.symbol} className="rounded-lg border border-white/[0.03] bg-black/10 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium text-ink-100">{r.symbol}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono", sentColor)}>
                      {r.sentiment_score > 0 ? "+" : ""}{r.sentiment_score?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1">
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-crimson-500/40 transition-all"
                          style={{ width: `${attBar}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-ink-500">{r.mention_volume?.toLocaleString()} mentions</span>
                  </div>
                  {r.growth_rate !== undefined && (
                    <p className="mt-1 text-[10px] text-ink-500">
                      Growth: <span className={cn("font-mono", r.growth_rate > 0 ? "text-emerald-400" : "text-crimson-400")}>
                        {r.growth_rate > 0 ? "+" : ""}{r.growth_rate}%
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 text-ink-500 hover:bg-white/5 hover:text-ink-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={cn(
                    "h-6 w-6 rounded text-[11px] font-mono transition",
                    i === page
                      ? "bg-crimson-600/30 text-crimson-300 font-semibold"
                      : "text-ink-500 hover:bg-white/5 hover:text-ink-200"
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="rounded p-1 text-ink-500 hover:bg-white/5 hover:text-ink-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </BentoCard>
  );
}

function DiscoveryBuckets() {
  const { data, isLoading } = useQuery({ queryKey: ["buckets"], queryFn: () => api.buckets() });
  return (
    <BentoCard span="col-span-12" title="Discovery Buckets" subtitle="Stocks grouped by opportunity type">
      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="animate-spin text-ink-500" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Object.entries(data as Record<string, any[]>).map(([bucket, stocks]) => (
            <div key={bucket} className="rounded-xl border border-white/5 bg-black/20 p-3">
              <p className="text-xs font-medium text-ink-300 capitalize">{bucket.replace(/_/g, " ")}</p>
              <p className="font-mono text-lg font-semibold text-crimson-300">{stocks.length}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {stocks.slice(0, 4).map((s: any) => (
                  <span key={s.symbol} className="text-[10px] text-ink-500">{s.symbol}</span>
                ))}
                {stocks.length > 4 && <span className="text-[10px] text-ink-700">+{stocks.length - 4}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </BentoCard>
  );
}

export default function ResearchPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Newspaper size={24} className="text-crimson-400" /> Research
        </h1>
        <p className="text-sm text-ink-500">
          Market news, social sentiment, and trend intelligence.
        </p>
      </div>
      <div className="bento">
        <NewsFeed />
        <SentimentRadar />
        <DiscoveryBuckets />
      </div>
    </div>
  );
}
