"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export function DeepResearch({ symbol }: { symbol: string }) {
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["research", symbol],
    queryFn: () => api.research(symbol),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  if (!enabled) {
    return (
      <BentoCard span="col-span-12" title="AI Deep Research"
        subtitle="Comprehensive Ollama-powered analysis">
        <button
          onClick={() => setEnabled(true)}
          className="flex items-center gap-2 rounded-xl border border-crimson-500/20 bg-crimson-600/5 px-5 py-3 text-sm font-medium text-crimson-300 transition hover:bg-crimson-600/10"
        >
          <Brain size={18} /> Generate Deep Research Report
        </button>
        <p className="mt-2 text-[10px] text-ink-500">
          Combines technical indicators, fundamentals, sentiment, and news into a comprehensive research memo via Ollama AI.
        </p>
      </BentoCard>
    );
  }

  if (isLoading) {
    return (
      <BentoCard span="col-span-12" title="AI Deep Research">
        <div className="flex items-center gap-3 py-8">
          <Loader2 size={20} className="animate-spin text-crimson-400" />
          <div>
            <p className="text-sm text-ink-100">Generating comprehensive analysis…</p>
            <p className="text-[11px] text-ink-500">Fetching technicals, fundamentals, sentiment, and news → Ollama AI synthesis</p>
          </div>
        </div>
      </BentoCard>
    );
  }

  if (!data) return null;

  return (
    <>
      <BentoCard span="col-span-12" title={`AI Research Report — ${data.name || symbol}`}
        subtitle={`${data.sector} · ${data.industry}`}
        action={<span className="text-[10px] text-ink-500">Generated {new Date(data.generated_at).toLocaleTimeString()}</span>}
      >
        {/* Data summary badges */}
        <div className="mb-4 flex flex-wrap gap-2">
          {data.data_summary.rsi && (
            <Badge label="RSI" value={data.data_summary.rsi.toFixed(0)}
              color={data.data_summary.rsi < 30 ? "green" : data.data_summary.rsi > 70 ? "red" : "neutral"} />
          )}
          {data.data_summary.macd_signal && (
            <Badge label="MACD" value={data.data_summary.macd_signal}
              color={data.data_summary.macd_signal === "bullish" ? "green" : "red"} />
          )}
          {data.data_summary.trend && (
            <Badge label="Trend" value={data.data_summary.trend}
              color={data.data_summary.trend === "bullish" ? "green" : "red"} />
          )}
          {data.data_summary.pe && (
            <Badge label="P/E" value={data.data_summary.pe.toFixed(1)} color="neutral" />
          )}
          {data.data_summary.recommendation && (
            <Badge label="Analyst" value={data.data_summary.recommendation.replace("_", " ")}
              color={data.data_summary.recommendation.includes("buy") ? "green" : data.data_summary.recommendation.includes("sell") ? "red" : "neutral"} />
          )}
          {data.data_summary.target_mean && (
            <Badge label="Target" value={`$${data.data_summary.target_mean.toFixed(0)}`} color="neutral" />
          )}
        </div>

        {/* AI analysis text */}
        <div className="prose prose-invert prose-sm max-w-none">
          <div className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/20 p-5 text-sm leading-relaxed text-ink-200">
            {data.analysis}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-1.5 text-[10px] text-amber-400/80">
          {data.disclaimer}
        </p>
      </BentoCard>

      {/* Related news */}
      {data.news?.length > 0 && (
        <BentoCard span="col-span-12" title="Sources & News Used in Analysis">
          <div className="grid gap-2 lg:grid-cols-3">
            {data.news.map((n: any, i: number) => (
              <a key={i} href={n.url} target="_blank" rel="noreferrer"
                className="group rounded-lg border border-white/5 bg-black/20 p-3 transition hover:border-crimson-500/20">
                <p className="text-xs text-ink-100 line-clamp-2 group-hover:text-crimson-300 transition">
                  {n.headline}
                  <ExternalLink size={10} className="ml-1 inline opacity-0 group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-[10px] text-ink-500">{n.source}</p>
              </a>
            ))}
          </div>
        </BentoCard>
      )}
    </>
  );
}

function Badge({ label, value, color }: { label: string; value: string; color: "green" | "red" | "neutral" }) {
  return (
    <span className={cn(
      "rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase",
      color === "green" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : color === "red" ? "border-crimson-500/20 bg-crimson-600/10 text-crimson-400"
      : "border-white/10 bg-white/5 text-ink-300"
    )}>
      {label}: {value}
    </span>
  );
}
