"use client";
import { Line, LineChart, Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface Props {
  monteCarlo: {
    initial: number;
    days: number;
    n_sims: number;
    df_fat_tail: number;
    percentiles: Record<string, number>;
    sample_paths: number[][];
    time_points: number[];
    prob_profit: number;
    prob_loss_10pct: number;
    prob_gain_20pct: number;
    expected_value: number;
    median_value: number;
    avg_max_drawdown: number;
    worst_max_drawdown: number;
  };
}

export function MonteCarloChart({ monteCarlo }: Props) {
  const { sample_paths, time_points, percentiles, initial, n_sims, df_fat_tail } = monteCarlo;

  // Build percentile band data from sample paths
  const bandData: any[] = [];
  const n = sample_paths.length;
  for (let t = 0; t < time_points.length; t++) {
    const vals = sample_paths.map((p) => p[t]).sort((a, b) => a - b);
    bandData.push({
      day: time_points[t],
      p5: vals[Math.floor(n * 0.05)],
      p10: vals[Math.floor(n * 0.10)],
      p25: vals[Math.floor(n * 0.25)],
      p50: vals[Math.floor(n * 0.50)],
      p75: vals[Math.floor(n * 0.75)],
      p90: vals[Math.floor(n * 0.90)],
      p95: vals[Math.floor(n * 0.95)],
    });
  }

  const fmt = (v: number) => `$${(v / 1000).toFixed(1)}K`;
  const pctFmt = (v: number) => `${v.toFixed(1)}%`;

  const stats = [
    { label: "P(Profit)", value: monteCarlo.prob_profit, fmt: pctFmt, good: monteCarlo.prob_profit > 50 },
    { label: "P(>20% gain)", value: monteCarlo.prob_gain_20pct, fmt: pctFmt, good: true },
    { label: "P(>10% loss)", value: monteCarlo.prob_loss_10pct, fmt: pctFmt, good: false },
    { label: "Expected", value: monteCarlo.expected_value, fmt: fmt, good: monteCarlo.expected_value > initial },
    { label: "Median", value: monteCarlo.median_value, fmt: fmt, good: monteCarlo.median_value > initial },
    { label: "Avg Max DD", value: monteCarlo.avg_max_drawdown * 100, fmt: pctFmt, good: false },
    { label: "Worst DD", value: monteCarlo.worst_max_drawdown * 100, fmt: pctFmt, good: false },
  ];

  return (
    <BentoCard span="col-span-12 lg:col-span-8" title="Monte Carlo Simulation"
      subtitle={`${n_sims.toLocaleString()} paths · Student-t(df=${df_fat_tail}) fat-tail innovation · 1Y projection`}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={bandData} margin={{ top: 5, right: 20, bottom: 25, left: 15 }}>
          <defs>
            <linearGradient id="mc90" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff3b5c" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#ff3b5c" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="mc50" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{ fill: "#8a7479", fontSize: 10 }}
            label={{ value: "Trading Days", position: "bottom", fill: "#8a7479", fontSize: 10, dy: 12 }} />
          <YAxis tick={{ fill: "#8a7479", fontSize: 10 }} tickFormatter={fmt} width={55} />
          <Tooltip
            contentStyle={{ background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
            formatter={(val: number, name: string) => [fmt(val), name.toUpperCase()]}
          />
          <ReferenceLine y={initial} stroke="#4a3b3f" strokeDasharray="4 4" label={{ value: "Initial", fill: "#4a3b3f", fontSize: 9 }} />
          {/* 5-95 band */}
          <Area dataKey="p95" stroke="none" fill="url(#mc90)" stackId="outer" />
          <Area dataKey="p5" stroke="#ff3b5c" strokeWidth={0.5} strokeDasharray="2 2" fill="none" />
          <Area dataKey="p95" stroke="#34d399" strokeWidth={0.5} strokeDasharray="2 2" fill="none" />
          {/* 25-75 band */}
          <Area dataKey="p75" stroke="none" fill="url(#mc50)" />
          <Area dataKey="p25" stroke="#ff6b81" strokeWidth={0.5} dot={false} fill="none" />
          <Area dataKey="p75" stroke="#6ee7b7" strokeWidth={0.5} dot={false} fill="none" />
          {/* Median */}
          <Line type="monotone" dataKey="p50" stroke="#fbbf24" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-black/20 px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-ink-500">{s.label}</p>
            <p className={cn("font-mono text-sm font-semibold",
              s.good ? "text-emerald-400" : "text-crimson-400"
            )}>
              {s.fmt(s.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Percentile table */}
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        {Object.entries(percentiles).map(([k, v]) => (
          <span key={k} className="text-ink-500">
            {k.toUpperCase()}: <span className="font-mono text-ink-300">{fmt(v)}</span>
          </span>
        ))}
      </div>
    </BentoCard>
  );
}
