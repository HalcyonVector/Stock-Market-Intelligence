"use client";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface BacktestData {
  cumulative: number[];
  drawdown: number[];
  rolling_sharpe: number[];
  rolling_vol: number[];
  window: number;
  total_return: number;
  n_days: number;
}

interface Props {
  backtests: Record<string, BacktestData>;
  strategyColors: Record<string, string>;
}

export function BacktestChart({ backtests, strategyColors }: Props) {
  // Build combined chart data
  const maxLen = Math.max(...Object.values(backtests).map((b) => b.cumulative.length));
  const step = Math.max(1, Math.floor(maxLen / 150));

  const cumulativeData: any[] = [];
  const drawdownData: any[] = [];

  for (let i = 0; i < maxLen; i += step) {
    const cumRow: any = { day: i };
    const ddRow: any = { day: i };
    for (const [name, bt] of Object.entries(backtests)) {
      if (i < bt.cumulative.length) {
        cumRow[name] = +((bt.cumulative[i] - 1) * 100).toFixed(2);
        ddRow[name] = +(bt.drawdown[i] * 100).toFixed(2);
      }
    }
    cumulativeData.push(cumRow);
    drawdownData.push(ddRow);
  }

  const names = Object.keys(backtests);

  return (
    <BentoCard span="col-span-12" title="Historical Backtest"
      subtitle={`${Object.values(backtests)[0]?.n_days ?? 0} trading days · ${Object.values(backtests)[0]?.window ?? 60}-day rolling window`}>
      <div className="space-y-4">
        {/* Cumulative returns */}
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Cumulative Return (%)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={cumulativeData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#8a7479", fontSize: 9 }} />
              <YAxis tick={{ fill: "#8a7479", fontSize: 9 }} tickFormatter={(v) => `${v}%`} width={45} />
              <Tooltip
                contentStyle={{ background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                formatter={(val: number, name: string) => [`${val.toFixed(2)}%`, name.replace(/_/g, " ")]}
              />
              {names.map((name) => (
                <Line
                  key={name} dataKey={name} stroke={strategyColors[name] ?? "#ff3b5c"}
                  strokeWidth={1.5} dot={false} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Drawdown */}
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Drawdown (%)</p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={drawdownData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <XAxis dataKey="day" tick={{ fill: "#8a7479", fontSize: 9 }} />
              <YAxis tick={{ fill: "#8a7479", fontSize: 9 }} tickFormatter={(v) => `${v}%`} width={45} />
              <Tooltip
                contentStyle={{ background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                formatter={(val: number, name: string) => [`${val.toFixed(2)}%`, name.replace(/_/g, " ")]}
              />
              {names.map((name) => (
                <Area
                  key={name} dataKey={name} stroke={strategyColors[name] ?? "#ff3b5c"}
                  fill={strategyColors[name] ?? "#ff3b5c"} fillOpacity={0.1}
                  strokeWidth={1} dot={false} connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary table */}
        <div className="flex flex-wrap gap-3">
          {names.map((name) => {
            const bt = backtests[name];
            return (
              <div key={name} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: strategyColors[name] ?? "#ff3b5c" }} />
                <span className="text-ink-300">{name.replace(/_/g, " ")}</span>
                <span className={cn("font-mono", bt.total_return >= 0 ? "text-emerald-400" : "text-crimson-400")}>
                  {bt.total_return >= 0 ? "+" : ""}{(bt.total_return * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </BentoCard>
  );
}
