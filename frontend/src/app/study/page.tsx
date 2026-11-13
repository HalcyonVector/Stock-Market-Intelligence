"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Cell,
} from "recharts";
import { BarChart3, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

/* Market Study: the README's findings as an interactive page. The numbers are
 * recomputed weekly by a GitHub Actions job (scripts/market_findings.py). */

type Stock = { symbol: string; market: "US" | "IN"; sector: string; return_pct: number; volatility_pct: number; max_drawdown_pct: number };
const COLORS = { US: "#60a5fa", IN: "#f59e0b" };
const MKT = { US: "US", IN: "India" };
const tooltipStyle = { background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 };

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const signed = (v: number | null | undefined, d = 1) => (v == null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);

export default function StudyPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({ queryKey: ["study"], queryFn: () => api.study(), staleTime: 60 * 60_000 });
  const [show, setShow] = useState<{ US: boolean; IN: boolean }>({ US: true, IN: true });
  const stocks: Stock[] = useMemo(() => (data?.stocks ?? []).filter((s: Stock) => show[s.market]), [data, show]);

  const histogram = useMemo(() => {
    const edges = [-60, -40, -20, 0, 20, 40, 60, 100];
    const label = (i: number) => i === 0 ? `< ${edges[0]}%` : i === edges.length ? `> ${edges[edges.length - 1]}%` : `${edges[i - 1]} to ${edges[i]}%`;
    const bins = Array.from({ length: edges.length + 1 }, (_, i) => ({ bin: label(i), US: 0, IN: 0 }));
    const totals = { US: 0, IN: 0 };
    for (const s of data?.stocks ?? []) {
      const i = edges.findIndex((e) => s.return_pct < e);
      bins[i === -1 ? edges.length : i][s.market as "US" | "IN"]++;
      totals[s.market as "US" | "IN"]++;
    }
    return bins.map((b) => ({ ...b, US: totals.US ? +(b.US / totals.US * 100).toFixed(1) : 0, IN: totals.IN ? +(b.IN / totals.IN * 100).toFixed(1) : 0 }));
  }, [data]);

  // Round axis bounds to readable steps; clip extreme returns to the edge.
  const axes = useMemo(() => {
    const vols = stocks.map((s) => s.volatility_pct);
    const rets = stocks.map((s) => Math.max(-80, Math.min(200, s.return_pct)));
    const xMax = Math.ceil(Math.max(20, ...vols) / 20) * 20;
    const yMin = Math.floor(Math.min(0, ...rets) / 50) * 50;
    const yMax = Math.ceil(Math.max(50, ...rets) / 50) * 50;
    const by = (lo: number, hi: number, d: number) => Array.from({ length: Math.round((hi - lo) / d) + 1 }, (_, i) => lo + i * d);
    const xStep = xMax > 100 ? 50 : 20;
    return { x: [0, xMax] as [number, number], y: [yMin, yMax] as [number, number], xTicks: by(0, xMax, xStep), yTicks: by(yMin, yMax, 50) };
  }, [stocks]);
  const plotted = useMemo(() => stocks.map((s) => ({ ...s, y: Math.max(-80, Math.min(200, s.return_pct)) })), [stocks]);

  const sectors = useMemo(() => {
    const by: Record<string, number[]> = {};
    for (const s of stocks) (by[s.sector] ??= []).push(s.return_pct);
    return Object.entries(by).filter(([, v]) => v.length >= 3)
      .map(([sector, v]) => ({ sector, median: +median(v).toFixed(1), n: v.length }))
      .sort((a, b) => b.median - a.median);
  }, [stocks]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 size={24} className="text-crimson-400" /> Market Study
        </h1>
        <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-crimson-400" /></div>
      </div>
    );
  }
  if (isError || !data?.window) {
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-white/10 p-6 text-center text-sm text-ink-400">
        <h1 className="mb-2 text-lg font-semibold text-ink-100">Market Study</h1>
        The study hasn&apos;t been computed yet. It&apos;s produced weekly by the <span className="font-mono">Market study</span> GitHub
        Actions workflow (or run <span className="font-mono">python -m scripts.market_findings</span> locally).
      </div>
    );
  }

  const [start, end, days] = data.window;
  const gc = data.global_cues ?? {};
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const rows: [string, (m: any) => string][] = [
    ["Stocks", (m) => String(m.stocks)],
    ["Median 1-year return", (m) => signed(m.median_return_pct)],
    ["Share of stocks that rose", (m) => `${m.share_rose_pct}%`],
    ["Median annualised volatility", (m) => `${m.median_volatility_pct}%`],
    ["Median maximum drawdown", (m) => `${m.median_max_drawdown_pct}%`],
    ["Average correlation between stocks", (m) => m.avg_pairwise_correlation.toFixed(2)],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 size={24} className="text-crimson-400" /> Market Study
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-400">
          How did {data.US.stocks} US and {data.IN.stocks} Indian stocks behave from {fmtDate(start)} to {fmtDate(end)} ({days} trading days)?
          Adjusted daily closes, recomputed every week.
        </p>
      </div>

      <div className="bento">
        <BentoCard span="col-span-12 lg:col-span-5" title="US vs India at a glance" subtitle="Medians across stocks in each market">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
              <th className="py-1.5 font-medium" /><th className="py-1.5 text-right font-medium">US</th><th className="py-1.5 text-right font-medium">India</th>
            </tr></thead>
            <tbody>
              {rows.map(([label, f]) => (
                <tr key={label} className="border-t border-white/5">
                  <td className="py-1.5 text-ink-400">{label}</td>
                  <td className="py-1.5 text-right font-mono text-ink-100">{f(data.US)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-100">{f(data.IN)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/5">
                <td className="py-1.5 text-ink-400">Benchmark</td>
                <td className="py-1.5 text-right font-mono text-ink-100">SPY {signed(data.benchmarks_pct?.SPY)}</td>
                <td className="py-1.5 text-right font-mono text-ink-100">Nifty {signed(data.benchmarks_pct?.["^NSEI"])}</td>
              </tr>
            </tbody>
          </table>
        </BentoCard>

        <BentoCard span="col-span-12 lg:col-span-7" title="How 1-year returns were spread" subtitle="Share of each market's stocks in each return band">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={histogram} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="bin" tick={{ fill: "#8a7479", fontSize: 10 }} interval={0} />
              <YAxis tick={{ fill: "#8a7479", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k: string) => [`${v}% of stocks`, MKT[k as "US" | "IN"]]} />
              <Legend formatter={(k) => MKT[k as "US" | "IN"]} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="US" fill={COLORS.US} radius={[3, 3, 0, 0]} />
              <Bar dataKey="IN" fill={COLORS.IN} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </BentoCard>

        <BentoCard span="col-span-12 lg:col-span-8" title="Risk vs return" subtitle="Each dot is a stock. Further right = bumpier ride; higher = better year. Click a dot to open it."
          action={
            <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
              {(["US", "IN"] as const).map((m) => (
                <button key={m} onClick={() => setShow((s) => ({ ...s, [m]: !s[m] }))}
                  className={cn("rounded-md px-2 py-0.5", show[m] ? "bg-white/10 text-ink-100" : "text-ink-500")}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[m] }} />{MKT[m]}
                </button>
              ))}
            </div>
          }>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 12, left: -6, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" dataKey="volatility_pct" name="Volatility" unit="%" tick={{ fill: "#8a7479", fontSize: 11 }}
                domain={axes.x} ticks={axes.xTicks}
                label={{ value: "Annualised volatility", position: "insideBottom", offset: -6, fill: "#8a7479", fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="Return" unit="%" tick={{ fill: "#8a7479", fontSize: 11 }}
                domain={axes.y} ticks={axes.yTicks} />
              <ZAxis range={[36, 36]} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  const s = payload?.[0]?.payload as Stock | undefined;
                  if (!s) return null;
                  return (
                    <div style={tooltipStyle} className="px-3 py-2">
                      <p className="font-mono font-semibold">{s.symbol} <span className="text-ink-500">{MKT[s.market]} · {s.sector}</span></p>
                      <p>Return {signed(s.return_pct)} · Volatility {s.volatility_pct}% · Worst fall {s.max_drawdown_pct}%</p>
                    </div>
                  );
                }} />
              <Scatter data={plotted} onClick={(p: any) => p?.symbol && router.push(`/stock/${p.symbol}`)} className="cursor-pointer">
                {stocks.map((s) => <Cell key={s.symbol} fill={COLORS[s.market]} fillOpacity={0.75} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-ink-500">Returns above +200% or below -80% are drawn at the edge.</p>
        </BentoCard>

        <BentoCard span="col-span-12 lg:col-span-4" title="Global cues" subtitle="Does a US session tell you anything about India's next one?">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Same-day correlation" value={gc.same_day_corr?.toFixed(2) ?? "n/a"} hint="US and India on the same date" />
            <Stat label="Next-session correlation" value={gc.next_day_corr?.toFixed(2) ?? "n/a"} hint="US day vs India's next session" accent />
          </div>
          {gc.big_day_same_direction_pct != null && (
            <p className="mt-3 text-sm text-ink-300">
              On the <span className="font-semibold text-ink-100">{gc.big_us_days}</span> biggest US days, Indian stocks moved the
              same way at their next session <span className="font-semibold text-amber-300">{gc.big_day_same_direction_pct}%</span> of the time.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            India closes before New York opens, so same-day numbers understate the link. Equal-weighted daily returns of the tracked stocks
            in each market. Correlation is not a trading signal.
          </p>
        </BentoCard>

        <BentoCard span="col-span-12 lg:col-span-6" title="Median return by sector" subtitle="Sectors with at least 3 stocks, in the markets selected above">
          <ResponsiveContainer width="100%" height={Math.max(200, sectors.length * 32 + 30)}>
            <BarChart data={sectors} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={6}>
              <XAxis type="number" tick={{ fill: "#8a7479", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="sector" width={150} interval={0} tick={{ fill: "#c9b8bd", fontSize: 11 }} />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _k, p: any) => [`${signed(v)} (${p.payload.n} stocks)`, "Median return"]} />
              <Bar dataKey="median" radius={[0, 3, 3, 0]}>
                {sectors.map((s) => <Cell key={s.sector} fill={s.median >= 0 ? "#10b981" : "#e11d48"} fillOpacity={0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </BentoCard>

        <BentoCard span="col-span-12 lg:col-span-6" title="For savers in India" subtitle="What's left after tax and inflation, and what fund plans cost">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.real_returns_pct ?? {}).map(([k, v]: [string, any]) => (
              <Stat key={k} label={k} value={signed(v, 2)} hint="a year, after 5% inflation" accent={v < 0} />
            ))}
          </div>
          {data.direct_vs_regular?.length > 0 && (
            <table className="mt-4 w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-500">
                <th className="py-1 font-medium">Fund (5-year return a year)</th><th className="py-1 text-right font-medium">Direct</th>
                <th className="py-1 text-right font-medium">Regular</th><th className="py-1 text-right font-medium">Gap</th>
              </tr></thead>
              <tbody>
                {data.direct_vs_regular.map((f: any) => (
                  <tr key={f.fund} className="border-t border-white/5">
                    <td className="py-1.5 text-ink-300">{f.fund}</td>
                    <td className="py-1.5 text-right font-mono">{f.direct["5y"]}%</td>
                    <td className="py-1.5 text-right font-mono">{f.regular["5y"]}%</td>
                    <td className="py-1.5 text-right font-mono text-amber-300">{(f.direct["5y"] - f.regular["5y"]).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[11px] text-ink-500">
            Same fund, same holdings: the gap is the distributor commission in the Regular plan. Try your own numbers in{" "}
            <Link href="/invest" className="text-crimson-300 hover:text-crimson-200">Safe Invest</Link>.
          </p>
        </BentoCard>
      </div>

      <p className="text-[11px] text-ink-500">
        Method: adjusted daily closes from Yahoo Finance for the app&apos;s tracked list (a hand-picked set of well-known names, so expect
        selection and survivorship bias); medians across stocks; volatility is the annualised standard deviation of daily returns; maximum
        drawdown is the worst fall from a previous high. Fund returns from AMFI NAVs. Computed {data.generated_at ? new Date(data.generated_at).toLocaleString() : "weekly"}.
        Educational only, not advice.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn("font-mono text-xl font-semibold", accent ? "text-amber-300" : "text-ink-100")}>{value}</p>
      {hint && <p className="text-[10px] text-ink-500">{hint}</p>}
    </div>
  );
}
