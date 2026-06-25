"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Loader2, Brain } from "lucide-react";
import { Area, Line, ComposedChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export function PriceForecast({ symbol }: { symbol: string }) {
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["forecast", symbol, days],
    queryFn: () => api.forecast(symbol, days),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  if (!enabled) {
    return (
      <BentoCard span="col-span-12" title="ML Price Forecast"
        subtitle="SARIMA seasonal time-series model">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEnabled(true)}
            className="flex items-center gap-2 rounded-xl border border-crimson-500/20 bg-crimson-600/5 px-5 py-3 text-sm font-medium text-crimson-300 transition hover:bg-crimson-600/10"
          >
            <Brain size={18} /> Generate Forecast
          </button>
          <div className="flex gap-1">
            {[14, 30, 60, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] transition",
                  d === days ? "bg-crimson-600/20 text-crimson-400" : "text-ink-500 hover:text-ink-300"
                )}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </BentoCard>
    );
  }

  if (isLoading) {
    return (
      <BentoCard span="col-span-12" title="ML Price Forecast">
        <div className="flex items-center gap-3 py-6">
          <Loader2 size={20} className="animate-spin text-crimson-400" />
          <span className="text-sm text-ink-300">Computing {days}-day forecast…</span>
        </div>
      </BentoCard>
    );
  }

  if (!data || data.error) return null;

  const tooltipStyle = {
    background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11,
  };

  return (
    <BentoCard span="col-span-12" title={`ML Price Forecast — ${days} Day`}
      subtitle={data.method}
      action={
        <div className="flex gap-1">
          {[14, 30, 60, 90].map((d) => (
            <button key={d} onClick={() => { setDays(d); }}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] transition",
                d === days ? "bg-crimson-600/20 text-crimson-400" : "text-ink-500 hover:text-ink-300"
              )}>
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {/* Summary metrics */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric label="Current" value={`$${data.current_price}`} />
        <Metric label={`${days}d Forecast`} value={`$${data.forecast_end_price}`}
          color={data.forecast_change_pct >= 0} />
        <Metric label="Expected Change" value={`${data.forecast_change_pct >= 0 ? "+" : ""}${data.forecast_change_pct}%`}
          color={data.forecast_change_pct >= 0} />
        <Metric label="Forecast Range" value={`$${data.forecast_low} – $${data.forecast_high}`} />
        <Metric label="R² (Linear)" value={data.models.linear.r_squared.toFixed(3)} />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data.chart_data}>
          <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "#8a7479", fontSize: 9 }} width={55} />
          <Tooltip contentStyle={tooltipStyle} />
          <ReferenceLine y={data.current_price} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          {/* 95% CI band */}
          <Area dataKey="upper_95" stroke="none" fill="rgba(139,92,246,0.08)" />
          <Area dataKey="lower_95" stroke="none" fill="none" />
          {/* 80% CI band */}
          <Area dataKey="upper_80" stroke="none" fill="rgba(139,92,246,0.12)" />
          <Area dataKey="lower_80" stroke="none" fill="none" />
          {/* Lines */}
          <Line dataKey="actual" stroke="#ff3b5c" strokeWidth={1.5} dot={false} name="Actual" />
          <Line dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="6 3" name="Forecast" />
          <Line dataKey="upper_95" stroke="rgba(139,92,246,0.3)" strokeWidth={0.5} dot={false} name="95% Upper" />
          <Line dataKey="lower_95" stroke="rgba(139,92,246,0.3)" strokeWidth={0.5} dot={false} name="95% Lower" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 flex gap-4 text-[10px]">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#ff3b5c]" /> Historical</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[#8b5cf6]" style={{ borderBottom: "2px dashed" }} /> Forecast</span>
        <span className="flex items-center gap-1 text-ink-500"><span className="h-2 w-3 rounded-sm bg-purple-500/20" /> 80%/95% CI</span>
      </div>

      {/* Disclaimer */}
      <p className="mt-2 rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-1.5 text-[10px] text-amber-400/80">
        {data.disclaimer}
      </p>
    </BentoCard>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-ink-500">{label}</p>
      <p className={cn("font-mono text-sm font-semibold",
        color === true ? "text-emerald-400" : color === false ? "text-crimson-400" : "text-ink-100"
      )}>{value}</p>
    </div>
  );
}
