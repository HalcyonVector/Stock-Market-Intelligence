"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FlaskConical, Play, Loader2 } from "lucide-react";
import { Area, AreaChart, Line, LineChart, ComposedChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export default function BacktestPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [strategy, setStrategy] = useState("rsi_oversold");
  const [capital, setCapital] = useState("10000");
  const [lookback, setLookback] = useState("365");

  const { data: strategies } = useQuery({
    queryKey: ["backtestStrategies"],
    queryFn: () => api.backtestStrategies(),
  });

  const mutation = useMutation({
    mutationFn: () => api.backtest(symbol.toUpperCase(), strategy, undefined, Number(capital), Number(lookback)),
  });

  const result = mutation.data;
  const tooltipStyle = {
    background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FlaskConical size={24} className="text-crimson-400" /> Strategy Backtester
        </h1>
        <p className="text-sm text-ink-500">Test trading strategies against historical data</p>
      </div>

      {/* Config */}
      <BentoCard span="col-span-12" title="Configuration">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">Symbol</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-mono outline-none focus:border-crimson-500/40" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">Strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-crimson-500/40">
              {(strategies ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">Initial Capital ($)</label>
            <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-mono outline-none focus:border-crimson-500/40" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">Lookback (days)</label>
            <select value={lookback} onChange={(e) => setLookback(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-crimson-500/40">
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-crimson-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-crimson-500 transition disabled:opacity-50">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run Backtest
            </button>
          </div>
        </div>
        {strategies && (
          <p className="mt-2 text-[10px] text-ink-500">
            {(strategies.find((s: any) => s.id === strategy) as any)?.description}
          </p>
        )}
      </BentoCard>

      {result && !result.error && (
        <>
          {/* Performance metrics */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            {[
              { label: "Total Return", value: `${result.total_return_pct >= 0 ? "+" : ""}${result.total_return_pct}%`, color: result.total_return_pct >= 0 },
              { label: "Benchmark", value: `${result.benchmark_return_pct >= 0 ? "+" : ""}${result.benchmark_return_pct}%`, color: result.benchmark_return_pct >= 0 },
              { label: "Alpha", value: `${result.alpha >= 0 ? "+" : ""}${result.alpha}%`, color: result.alpha >= 0 },
              { label: "Win Rate", value: `${result.win_rate}%`, color: result.win_rate > 50 },
              { label: "Sharpe", value: result.sharpe_ratio, color: result.sharpe_ratio > 1 },
              { label: "Max DD", value: `-${result.max_drawdown_pct}%`, color: false },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                <p className="text-[9px] uppercase tracking-wider text-ink-500">{m.label}</p>
                <p className={cn("font-mono text-lg font-bold", m.color ? "text-emerald-400" : "text-crimson-400")}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <BentoCard span="col-span-12" title="Equity Curve vs Buy & Hold">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={result.equity_curve}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
                <YAxis tick={{ fill: "#8a7479", fontSize: 9 }} width={55} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <ReferenceLine y={Number(capital)} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <Line dataKey="value" stroke="#ff3b5c" strokeWidth={2} dot={false} name="Strategy" />
                <Line dataKey="benchmark" stroke="#6ee7b7" strokeWidth={1} dot={false} name="Buy & Hold" strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </BentoCard>

          {/* Trade stats + log */}
          <div className="grid gap-3 lg:grid-cols-2">
            <BentoCard span="col-span-1" title="Trade Statistics">
              <div className="space-y-1 text-xs">
                <Row k="Total Trades" v={result.num_trades} />
                <Row k="Wins" v={result.num_wins} />
                <Row k="Losses" v={result.num_losses} />
                <Row k="Win Rate" v={`${result.win_rate}%`} />
                <Row k="Avg Win" v={`+${result.avg_win}%`} />
                <Row k="Avg Loss" v={`${result.avg_loss}%`} />
                <Row k="Final Value" v={`$${result.final_value.toLocaleString()}`} />
              </div>
            </BentoCard>

            <BentoCard span="col-span-1" title="Recent Trades">
              <div className="max-h-48 overflow-y-auto space-y-1">
                {result.trades.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] font-bold",
                        t.action === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-crimson-600/15 text-crimson-400"
                      )}>
                        {t.action}
                      </span>
                      <span className="text-[10px] text-ink-500">{t.date}</span>
                    </div>
                    <div className="text-right text-[10px] font-mono">
                      <span className="text-ink-100">${t.price}</span>
                      {t.pnl_pct !== undefined && (
                        <span className={cn("ml-2", t.pnl_pct >= 0 ? "text-emerald-400" : "text-crimson-400")}>
                          {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>
        </>
      )}

      {result?.error && (
        <div className="rounded-xl border border-crimson-500/20 bg-crimson-600/5 p-4 text-sm text-crimson-300">
          {result.error}
        </div>
      )}

      {!result && !mutation.isPending && (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/10">
          <p className="text-sm text-ink-500">Configure your strategy above and click <span className="text-crimson-400">Run Backtest</span></p>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between border-b border-white/[0.03] py-1">
      <span className="text-ink-500">{k}</span>
      <span className="font-mono text-ink-100">{v}</span>
    </div>
  );
}
