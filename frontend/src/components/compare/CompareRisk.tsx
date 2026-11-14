"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

type Candle = { ts: string; close: number };
const day = (ts: string) => String(ts).slice(0, 10);

function series(candles: Candle[] | undefined): Map<string, number> {
  return new Map((candles ?? []).filter((c) => c.close).map((c) => [day(c.ts), c.close]));
}

/** Pearson correlation of daily returns on the days both stocks traded. */
export function correlation(a: Map<string, number>, b: Map<string, number>): number | null {
  const days = [...a.keys()].filter((d) => b.has(d)).sort();
  const xs: number[] = [], ys: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const [p, d] = [days[i - 1], days[i]];
    xs.push(a.get(d)! / a.get(p)! - 1);
    ys.push(b.get(d)! / b.get(p)! - 1);
  }
  if (xs.length < 20) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let cov = 0, vx = 0, vy = 0;
  xs.forEach((x, i) => { cov += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; vy += (ys[i] - my) ** 2; });
  return vx && vy ? cov / Math.sqrt(vx * vy) : null;
}

/** Benchmark's worst 5-session stretch: start and end dates and its return. */
export function worstWeek(bench: Map<string, number>): { from: string; to: string; pct: number } | null {
  const days = [...bench.keys()].sort();
  let worst: { from: string; to: string; pct: number } | null = null;
  for (let i = 5; i < days.length; i++) {
    const pct = (bench.get(days[i])! / bench.get(days[i - 5])! - 1) * 100;
    if (!worst || pct < worst.pct) worst = { from: days[i - 5], to: days[i], pct };
  }
  return worst;
}

function moveOver(s: Map<string, number>, from: string, to: string): number | null {
  // Closest trading days on or before each date (markets have different holidays).
  const days = [...s.keys()].sort();
  const at = (d: string) => { let v: number | undefined; for (const x of days) { if (x <= d) v = s.get(x); else break; } return v; };
  const a = at(from), b = at(to);
  return a && b ? (b / a - 1) * 100 : null;
}

const corrColor = (c: number) =>
  c >= 0.7 ? "bg-crimson-500/50" : c >= 0.4 ? "bg-crimson-500/25" : c >= 0.15 ? "bg-white/10" : c > -0.15 ? "bg-white/5" : "bg-emerald-500/25";

export function CompareRisk({ symbols, candles }: { symbols: string[]; candles: (Candle[] | undefined)[] }) {
  const benches = useQueries({
    queries: [["SPY", "S&P 500"], ["^NSEI", "Nifty 50"]].map(([s]) => ({
      queryKey: ["candles-compare", s],
      queryFn: () => api.candles(encodeURIComponent(s), "1d", 180),
      staleTime: 30 * 60_000,
    })),
  });

  const maps = useMemo(() => candles.map(series), [candles]);
  const matrix = useMemo(() => maps.map((a) => maps.map((b) => correlation(a, b))), [maps]);
  const weeks = useMemo(() => [
    { name: "S&P 500", w: worstWeek(series(benches[0].data as Candle[] | undefined)) },
    { name: "Nifty 50", w: worstWeek(series(benches[1].data as Candle[] | undefined)) },
  ].filter((x) => x.w), [benches]);

  const pairs = [];
  for (let i = 0; i < symbols.length; i++) for (let j = i + 1; j < symbols.length; j++) {
    if (matrix[i][j] != null) pairs.push({ a: symbols[i], b: symbols[j], c: matrix[i][j]! });
  }
  pairs.sort((x, y) => y.c - x.c);
  const fmtD = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <BentoCard span="col-span-12 lg:col-span-6" title="How closely they move together"
        subtitle="Correlation of daily returns, last ~6 months (1 = in lockstep, 0 = unrelated)">
        <div className="overflow-x-auto">
          <table className="mx-auto text-xs">
            <thead>
              <tr><th />{symbols.map((s) => <th key={s} className="px-1 pb-1 font-mono font-medium text-ink-400">{s}</th>)}</tr>
            </thead>
            <tbody>
              {symbols.map((s, i) => (
                <tr key={s}>
                  <th className="pr-2 text-right font-mono font-medium text-ink-400">{s}</th>
                  {symbols.map((t, j) => {
                    const c = matrix[i]?.[j];
                    return (
                      <td key={t} className="p-0.5">
                        <div className={cn("grid h-10 w-14 place-items-center rounded-md font-mono", i === j ? "bg-white/[0.03] text-ink-600" : c == null ? "text-ink-600" : corrColor(c))}>
                          {i === j ? "1" : c == null ? "n/a" : c.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pairs.length > 0 && (
          <p className="mt-3 text-xs text-ink-400">
            Most alike: <span className="font-mono text-ink-200">{pairs[0].a}/{pairs[0].b}</span> ({pairs[0].c.toFixed(2)}).
            {pairs.length > 1 && <> Least alike: <span className="font-mono text-ink-200">{pairs[pairs.length - 1].a}/{pairs[pairs.length - 1].b}</span> ({pairs[pairs.length - 1].c.toFixed(2)}).</>}
            {pairs[0].c >= 0.7 && " Highly correlated stocks fall together, so holding both adds little diversification."}
          </p>
        )}
      </BentoCard>

      <BentoCard span="col-span-12 lg:col-span-6" title="In the market's worst week"
        subtitle="Each stock's move over the benchmark's worst 5 sessions of the last ~6 months">
        {weeks.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-500">Benchmark history isn&apos;t available right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-ink-500">
                <th className="py-1 text-left font-medium">Stock</th>
                {weeks.map(({ name, w }) => (
                  <th key={name} className="py-1 text-right font-medium">
                    {name}<span className="block normal-case tracking-normal text-ink-600">{fmtD(w!.from)} to {fmtD(w!.to)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/5 text-ink-400">
                <td className="py-1.5">Benchmark</td>
                {weeks.map(({ name, w }) => <td key={name} className="py-1.5 text-right font-mono">{w!.pct.toFixed(1)}%</td>)}
              </tr>
              {symbols.map((s, i) => (
                <tr key={s} className="border-t border-white/5">
                  <td className="py-1.5 font-mono font-medium">{s}</td>
                  {weeks.map(({ name, w }) => {
                    const m = moveOver(maps[i], w!.from, w!.to);
                    return (
                      <td key={name} className={cn("py-1.5 text-right font-mono", m == null ? "text-ink-600" : m < w!.pct ? "text-crimson-300" : "text-emerald-300")}>
                        {m == null ? "n/a" : `${m >= 0 ? "+" : ""}${m.toFixed(1)}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[10px] text-ink-500">Green held up better than the benchmark, red fell harder.</p>
      </BentoCard>
    </>
  );
}
