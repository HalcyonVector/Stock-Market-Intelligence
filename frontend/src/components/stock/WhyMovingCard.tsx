"use client";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { ScorePill } from "@/components/ui/ScorePill";

export function WhyMovingCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["why", symbol], queryFn: () => api.why(symbol) });

  return (
    <BentoCard
      span="col-span-12 lg:col-span-8"
      title="Why is this stock moving?"
      subtitle="AI explanation with traceable supporting signals"
      action={<Sparkles size={16} className="text-crimson-400 animate-pulseGlow" />}
    >
      {isLoading || !data ? (
        <div className="h-24 animate-pulse rounded-lg bg-white/5" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-100">{data.explanation}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
              <ShieldCheck size={12} /> confidence {(data.confidence * 100).toFixed(0)}%
            </span>
            {Object.entries(data.scores ?? {}).map(([k, v]: any) => (
              <ScorePill key={k} label={k.slice(0, 3)} value={v.value} />
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-500">Timeline</p>
            <ol className="space-y-2 border-l border-white/10 pl-4">
              {(data.timeline ?? []).slice(0, 6).map((ev: any, i: number) => (
                <li key={i} className="relative text-xs text-ink-300">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-crimson-500" />
                  <span className="text-ink-500">{String(ev.ts).slice(0, 16).replace("T", " ")}</span>{" "}
                  — {ev.label}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </BentoCard>
  );
}
