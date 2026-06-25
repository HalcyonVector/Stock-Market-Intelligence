"use client";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";

export function MarketBriefing() {
  const { data, isLoading } = useQuery({ queryKey: ["briefing"], queryFn: () => api.briefing() });
  return (
    <BentoCard
      span="col-span-12 lg:col-span-6"
      title="AI Market Briefing"
      subtitle="Synthesised from movers, sectors and discovery scores"
      action={<Sparkles size={16} className="text-crimson-400 animate-pulseGlow" />}
    >
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-lg bg-white/5" />
      ) : (
        <p className="text-sm leading-relaxed text-ink-300">{data?.briefing}</p>
      )}
    </BentoCard>
  );
}
