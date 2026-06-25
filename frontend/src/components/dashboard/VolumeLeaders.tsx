"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { changeColor, pct, cn } from "@/lib/utils";

function formatVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

export function VolumeLeaders() {
  const { data } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const rows = (data?.most_active ?? []).slice(0, 6);

  return (
    <BentoCard span="col-span-6 lg:col-span-3" title="Volume Leaders">
      <div className="space-y-1">
        {rows.map((q: any) => {
          const volRatio = q.avg_volume ? q.volume / q.avg_volume : 1;
          const barWidth = Math.min(100, volRatio * 50);
          return (
            <Link
              key={q.symbol}
              href={`/stock/${q.symbol}`}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
            >
              <span className="w-14 font-mono text-xs font-medium">{q.symbol}</span>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-crimson-500/50 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-ink-500 w-10 text-right">{formatVol(q.volume)}</span>
              <span className={cn("w-12 text-right font-mono text-[10px]", changeColor(q.change_pct))}>
                {pct(q.change_pct)}
              </span>
            </Link>
          );
        })}
      </div>
    </BentoCard>
  );
}
