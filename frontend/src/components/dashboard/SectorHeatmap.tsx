"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function tile(momentum: number) {
  // Map momentum 0..100 to a crimson->emerald scale.
  if (momentum >= 60) return "bg-emerald-500/20 border-emerald-500/40 text-emerald-300";
  if (momentum >= 45) return "bg-amber-500/15 border-amber-500/30 text-amber-300";
  return "bg-crimson-600/20 border-crimson-500/40 text-crimson-300";
}

export function SectorHeatmap() {
  const { data } = useQuery({ queryKey: ["sectors"], queryFn: () => api.sectors() });
  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Sector Rotation" subtitle="Momentum & net flow">
      <div className="grid grid-cols-3 gap-2">
        {(data ?? []).map((s: any) => (
          <div key={s.sector} className={cn("rounded-xl border p-3", tile(s.momentum))}>
            <p className="truncate text-xs font-medium">{s.sector}</p>
            <p className="font-mono text-lg font-semibold">{s.momentum}</p>
            <p className="text-[10px] opacity-70">{s.direction} {s.net_flow}</p>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}
