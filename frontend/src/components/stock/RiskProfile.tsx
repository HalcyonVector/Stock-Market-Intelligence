"use client";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/utils";

type Stats = { return_pct: number; volatility_pct: number | null; max_drawdown_pct: number };

const fmt = (v: number | null | undefined, signed = false) =>
  v == null ? "n/a" : `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** The stock's last year next to its benchmark and its sector's median stock. */
export function RiskProfile({ symbol }: { symbol: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["risk", symbol],
    queryFn: () => api.risk(symbol),
    staleTime: 60 * 60_000,
  });

  const cols: { label: string; s: Stats | null | undefined }[] = data
    ? [
        { label: symbol, s: data.stock },
        { label: data.benchmark_name, s: data.benchmark },
        ...(data.sector_median ? [{ label: `${data.sector} median (${data.sector_peers})`, s: data.sector_median }] : []),
      ]
    : [];

  const rows: { label: React.ReactNode; key: keyof Stats; signed?: boolean; better: "high" | "low" }[] = [
    { label: "1-year return", key: "return_pct", signed: true, better: "high" },
    { label: <Term>Volatility</Term>, key: "volatility_pct", better: "low" },
    { label: <Term>Max Drawdown</Term>, key: "max_drawdown_pct", better: "high" },
  ];

  const verdict = (() => {
    if (!data?.stock || !data?.benchmark) return null;
    const s = data.stock, b = data.benchmark;
    const riskier = (s.volatility_pct ?? 0) > (b.volatility_pct ?? 0) * 1.2;
    const beat = s.return_pct > b.return_pct;
    if (beat && riskier) return "Beat its benchmark, but with a noticeably bumpier ride.";
    if (beat) return "Beat its benchmark without much extra volatility.";
    if (riskier) return "Lagged its benchmark while being more volatile.";
    return "Lagged its benchmark, with similar or lower volatility.";
  })();

  return (
    <BentoCard span="col-span-12" title="Risk profile" subtitle="The last year, next to its benchmark and its sector"
      icon={<ShieldAlert size={14} className="text-amber-400" />} error={isError && !data} onRetry={() => refetch()}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />
      ) : !data ? (
        <p className="py-6 text-center text-xs text-ink-500">Not enough price history yet to measure this stock&apos;s risk.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-500">
                  <th className="py-1 text-left font-medium" />
                  {cols.map((c) => <th key={c.label} className="py-1 text-right font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-white/5">
                    <td className="py-1.5 text-ink-400">{r.label}</td>
                    {cols.map((c, i) => {
                      const v = c.s?.[r.key] ?? null;
                      const ref = cols[1]?.s?.[r.key];
                      const good = i === 0 && v != null && ref != null && (r.better === "high" ? v > ref : v < ref);
                      return (
                        <td key={c.label} className={cn("py-1.5 text-right font-mono",
                          i === 0 ? (good ? "text-emerald-300" : "text-ink-100") : "text-ink-400")}>
                          {fmt(v, r.signed)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-500"><Term>Beta</Term></p>
              <p className="font-mono text-lg text-ink-100">{data.beta ?? "n/a"}</p>
              <p className="text-[10px] text-ink-500">
                {data.beta != null ? `moves about ${data.beta.toFixed(1)}x the ${data.benchmark_name} on average` : "not enough shared trading days"}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Correlation</p>
              <p className="font-mono text-lg text-ink-100">{data.correlation ?? "n/a"}</p>
              <p className="text-[10px] text-ink-500">how closely daily moves track the benchmark (1 = in lockstep)</p>
            </div>
          </div>
          {verdict && <p className="text-xs text-ink-300">{verdict}</p>}
          <p className="text-[10px] text-ink-500">Daily closes {data.window[0]} to {data.window[1]}. Past behaviour, not a forecast.</p>
          </div>
        </div>
      )}
    </BentoCard>
  );
}
