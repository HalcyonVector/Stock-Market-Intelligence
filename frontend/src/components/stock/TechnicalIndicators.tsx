"use client";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ComposedChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function SignalBadge({ label, value, signal }: { label: string; value: string; signal: string }) {
  const color = signal === "bullish" || signal === "neutral" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : signal === "bearish" || signal === "overbought" ? "text-crimson-400 bg-crimson-600/10 border-crimson-500/20"
    : signal === "oversold" ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-ink-300 bg-white/5 border-white/10";

  return (
    <div className={cn("rounded-lg border px-3 py-2 text-center", color)}>
      <p className="text-[9px] uppercase tracking-wider text-ink-500">{label}</p>
      <p className="font-mono text-lg font-bold">{value}</p>
      <p className="text-[10px] capitalize">{signal}</p>
    </div>
  );
}

export function TechnicalIndicators({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["technicals", symbol],
    queryFn: () => api.technicals(symbol),
  });

  if (isLoading || !data || data.error) {
    return (
      <BentoCard span="col-span-12" title="Technical Analysis">
        <div className="flex h-32 items-center justify-center text-xs text-ink-500">
          {isLoading ? "Computing indicators…" : data?.error || "No data"}
        </div>
      </BentoCard>
    );
  }

  const { timestamps, close, rsi, macd, bollinger, stochastic, signals } = data;

  // Build chart data (downsample for perf)
  const step = Math.max(1, Math.floor(timestamps.length / 120));
  const chartData = timestamps
    .map((t: string, i: number) => ({
      t: t.slice(5),
      close: close[i],
      rsi: rsi[i],
      macd: macd.macd[i],
      macdSignal: macd.signal[i],
      macdHist: macd.histogram[i],
      bbUpper: bollinger.upper[i],
      bbMiddle: bollinger.middle[i],
      bbLower: bollinger.lower[i],
      sma20: data.sma_20[i],
      sma50: data.sma_50[i],
      stochK: stochastic.k[i],
      stochD: stochastic.d[i],
    }))
    .filter((_: any, i: number) => i % step === 0);

  const tooltipStyle = {
    background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11,
  };

  return (
    <>
      {/* Signal summary */}
      <BentoCard span="col-span-12" title="Technical Signals" subtitle="Current indicator readings">
        <div className="grid grid-cols-5 gap-2">
          <SignalBadge label="RSI (14)" value={signals.rsi.value.toString()} signal={signals.rsi.signal} />
          <SignalBadge label="MACD" value={signals.macd.value.toFixed(2)} signal={signals.macd.signal} />
          <SignalBadge label="Bollinger %B" value={signals.bollinger.pct_b.toFixed(2)} signal={signals.bollinger.signal} />
          <SignalBadge label="Stochastic %K" value={signals.stochastic.k.toString()} signal={signals.stochastic.signal} />
          <SignalBadge label="Trend" value={signals.trend.above_sma20 ? "Above" : "Below"} signal={signals.trend.signal} />
        </div>
      </BentoCard>

      {/* Price with Bollinger + MAs */}
      <BentoCard span="col-span-12 lg:col-span-8" title="Price · Bollinger Bands · Moving Averages">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "#8a7479", fontSize: 9 }} width={50} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area dataKey="bbUpper" stroke="none" fill="rgba(255,59,92,0.05)" />
            <Area dataKey="bbLower" stroke="none" fill="none" />
            <Line dataKey="bbUpper" stroke="#ff3b5c" strokeWidth={0.5} strokeDasharray="3 3" dot={false} />
            <Line dataKey="bbLower" stroke="#ff3b5c" strokeWidth={0.5} strokeDasharray="3 3" dot={false} />
            <Line dataKey="bbMiddle" stroke="#fbbf24" strokeWidth={0.5} dot={false} />
            <Line dataKey="sma20" stroke="#6ee7b7" strokeWidth={1} dot={false} />
            <Line dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} />
            <Line dataKey="close" stroke="#ff3b5c" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-1 flex gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#ff3b5c]" /> Price</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#6ee7b7]" /> SMA 20</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#8b5cf6]" /> SMA 50</span>
          <span className="flex items-center gap-1 text-ink-500"><span className="h-0.5 w-3 bg-[#ff3b5c] opacity-50" style={{ borderBottom: "1px dashed" }} /> Bollinger</span>
        </div>
      </BentoCard>

      {/* RSI */}
      <BentoCard span="col-span-12 lg:col-span-4" title="RSI (14)">
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
            <YAxis domain={[0, 100]} ticks={[20, 30, 50, 70, 80]} tick={{ fill: "#8a7479", fontSize: 9 }} width={30} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={70} stroke="rgba(255,59,92,0.3)" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="rgba(52,211,153,0.3)" strokeDasharray="3 3" />
            <Line dataKey="rsi" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </BentoCard>

      {/* MACD */}
      <BentoCard span="col-span-12 lg:col-span-6" title="MACD (12, 26, 9)">
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
            <YAxis tick={{ fill: "#8a7479", fontSize: 9 }} width={40} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Bar dataKey="macdHist" fill="rgba(255,59,92,0.3)" radius={[1, 1, 0, 0]} />
            <Line dataKey="macd" stroke="#ff3b5c" strokeWidth={1.5} dot={false} />
            <Line dataKey="macdSignal" stroke="#6ee7b7" strokeWidth={1} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </BentoCard>

      {/* Stochastic */}
      <BentoCard span="col-span-12 lg:col-span-6" title="Stochastic (14, 3)">
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
            <YAxis domain={[0, 100]} ticks={[20, 50, 80]} tick={{ fill: "#8a7479", fontSize: 9 }} width={30} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={80} stroke="rgba(255,59,92,0.3)" strokeDasharray="3 3" />
            <ReferenceLine y={20} stroke="rgba(52,211,153,0.3)" strokeDasharray="3 3" />
            <Line dataKey="stochK" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="%K" />
            <Line dataKey="stochD" stroke="#8b5cf6" strokeWidth={1} dot={false} name="%D" />
          </LineChart>
        </ResponsiveContainer>
      </BentoCard>
    </>
  );
}
