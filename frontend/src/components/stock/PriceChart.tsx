"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  ComposedChart, CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const TIMEFRAMES = [
  { label: "1W", lookback: 7 },
  { label: "1M", lookback: 30 },
  { label: "3M", lookback: 90 },
  { label: "6M", lookback: 180 },
  { label: "1Y", lookback: 365 },
];

export function PriceChart({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState(2); // default 3M

  const { data } = useQuery({
    queryKey: ["candles", symbol, TIMEFRAMES[timeframe].lookback],
    queryFn: () => api.candles(symbol, "1d", TIMEFRAMES[timeframe].lookback),
  });

  const series = (data ?? []).map((c: any) => ({
    t: typeof c.ts === "string" ? c.ts.slice(0, 10) : c.ts,
    close: c.close,
    open: c.open,
    high: c.high,
    low: c.low,
    volume: c.volume,
  }));

  if (series.length === 0) {
    return <div className="flex h-[260px] items-center justify-center text-xs text-ink-500">No price data</div>;
  }

  const minPrice = Math.min(...series.map((s) => s.low ?? s.close)) * 0.99;
  const maxPrice = Math.max(...series.map((s) => s.high ?? s.close)) * 1.01;

  const firstClose = series[0]?.close ?? 0;
  const lastClose = series[series.length - 1]?.close ?? 0;
  const changePct = firstClose > 0 ? ((lastClose - firstClose) / firstClose * 100) : 0;

  return (
    <div className="space-y-1">
      {/* Timeframe selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.label}
              onClick={() => setTimeframe(i)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium transition",
                i === timeframe
                  ? "bg-crimson-600/20 text-crimson-400 border border-crimson-500/20"
                  : "text-ink-500 hover:text-ink-300 hover:bg-white/5"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <span className={cn("text-xs font-mono", changePct >= 0 ? "text-emerald-400" : "text-crimson-400")}>
          {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}% ({TIMEFRAMES[timeframe].label})
        </span>
      </div>

      {/* Price chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={series}>
          <defs>
            <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={changePct >= 0 ? "#10b981" : "#e11d3a"} stopOpacity={0.35} />
              <stop offset="100%" stopColor={changePct >= 0 ? "#10b981" : "#e11d3a"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis
            dataKey="t" hide={series.length > 30}
            tick={{ fill: "#8a7479", fontSize: 10 }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fill: "#8a7479", fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(0)}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(10,5,6,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(val: number, name: string) => [
              name === "volume" ? val.toLocaleString() : `$${val.toFixed(2)}`,
              name.charAt(0).toUpperCase() + name.slice(1),
            ]}
          />
          <Area type="monotone" dataKey="close"
            stroke={changePct >= 0 ? "#10b981" : "#ff3b5c"}
            strokeWidth={2} fill={`url(#grad-${symbol})`} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume chart */}
      <ResponsiveContainer width="100%" height={50}>
        <BarChart data={series}>
          <Bar dataKey="volume" fill="rgba(225,29,58,0.2)" radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
