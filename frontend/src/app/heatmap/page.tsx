"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Grid3x3, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function getColor(pct: number): string {
  if (pct >= 3) return "bg-emerald-600";
  if (pct >= 2) return "bg-emerald-600/80";
  if (pct >= 1) return "bg-emerald-600/60";
  if (pct >= 0.5) return "bg-emerald-700/50";
  if (pct >= 0) return "bg-emerald-900/30";
  if (pct >= -0.5) return "bg-crimson-900/30";
  if (pct >= -1) return "bg-crimson-700/50";
  if (pct >= -2) return "bg-crimson-600/60";
  if (pct >= -3) return "bg-crimson-600/80";
  return "bg-crimson-600";
}

function getTextSize(cap: number, maxCap: number): string {
  const ratio = cap / maxCap;
  if (ratio > 0.15) return "text-sm font-bold";
  if (ratio > 0.05) return "text-xs font-semibold";
  return "text-[10px]";
}

export default function HeatmapPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["heatmap"],
    queryFn: () => api.heatmap(),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-crimson-400" size={32} />
      </div>
    );
  }

  const sectors = data.sectors as Record<string, any[]>;
  const sectorNames = Object.keys(sectors).sort((a, b) => {
    const capA = sectors[a].reduce((s: number, x: any) => s + (x.market_cap || 0), 0);
    const capB = sectors[b].reduce((s: number, x: any) => s + (x.market_cap || 0), 0);
    return capB - capA;
  });

  const totalCap = sectorNames.reduce(
    (s, sec) => s + sectors[sec].reduce((ss: number, x: any) => ss + (x.market_cap || 0), 0), 0
  );

  const maxSingleCap = Math.max(
    ...sectorNames.flatMap((s) => sectors[s].map((x: any) => x.market_cap || 0))
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Grid3x3 size={24} className="text-crimson-400" /> Market Heatmap
        </h1>
        <p className="text-sm text-ink-500">
          {data.total_stocks} stocks · sized by market cap · colored by daily change%
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[10px] text-ink-500">
        <span>-3%+</span>
        <div className="flex gap-0.5">
          {[-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3].map((v) => (
            <div key={v} className={cn("h-3 w-6 rounded-sm", getColor(v))} />
          ))}
        </div>
        <span>+3%+</span>
      </div>

      {/* Treemap grid */}
      <div className="space-y-2">
        {sectorNames.map((sector) => {
          const stocks = sectors[sector];
          const sectorCap = stocks.reduce((s: number, x: any) => s + (x.market_cap || 0), 0);
          const sectorPct = totalCap > 0 ? (sectorCap / totalCap) * 100 : 0;
          const avgChange = stocks.reduce((s: number, x: any) => s + (x.change_pct || 0), 0) / stocks.length;

          return (
            <div key={sector} className="rounded-xl border border-white/5 bg-white/[0.01] overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
                <span className="text-xs font-medium text-ink-100">{sector}</span>
                <span className={cn("text-[10px] font-mono",
                  avgChange >= 0 ? "text-emerald-400" : "text-crimson-400"
                )}>
                  {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}% · {stocks.length} stocks · {sectorPct.toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-[2px] p-[2px]">
                {stocks.map((stock: any) => {
                  const weight = sectorCap > 0 ? (stock.market_cap || 0) / sectorCap : 1 / stocks.length;
                  // Min width based on weight, with a floor
                  const widthPct = Math.max(4, weight * 100);

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/stock/${stock.symbol}`}
                      className={cn(
                        "group relative flex flex-col items-center justify-center rounded-md p-1.5 transition-all hover:ring-1 hover:ring-white/20",
                        getColor(stock.change_pct)
                      )}
                      style={{
                        flexBasis: `${widthPct}%`,
                        flexGrow: weight > 0.1 ? 2 : 1,
                        minHeight: weight > 0.15 ? 72 : weight > 0.05 ? 56 : 40,
                      }}
                    >
                      <span className={cn("font-mono leading-tight text-white/90", getTextSize(stock.market_cap, maxSingleCap))}>
                        {stock.symbol}
                      </span>
                      <span className="text-[9px] font-mono text-white/70">
                        {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%
                      </span>
                      {/* Tooltip on hover */}
                      <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-base-950/95 px-2.5 py-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        <p className="font-medium text-ink-100">{stock.name}</p>
                        <p className="text-ink-500">
                          ${stock.price?.toFixed(2)} · ${((stock.market_cap || 0) / 1e9).toFixed(0)}B
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
