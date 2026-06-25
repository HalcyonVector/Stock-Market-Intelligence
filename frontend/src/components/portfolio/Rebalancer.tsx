"use client";
import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import {
  Scale, ArrowUpCircle, ArrowDownCircle, MinusCircle,
  Loader2, AlertTriangle, CheckCircle2, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  symbols: string[];
}

export function Rebalancer({ symbols }: Props) {
  const [portfolioValue, setPortfolioValue] = useState(100000);
  const [strategy, setStrategy] = useState<"equal" | "custom">("equal");
  const [customWeights, setCustomWeights] = useState<Record<string, number>>({});

  const targetWeights = useMemo(() => {
    if (strategy === "equal") {
      const w = Math.round(10000 / symbols.length) / 100;
      return Object.fromEntries(symbols.map((s, i) =>
        [s, i === symbols.length - 1 ? Math.round((100 - w * (symbols.length - 1)) * 100) / 100 : w]
      ));
    }
    return customWeights;
  }, [strategy, symbols, customWeights]);

  const totalCustom = useMemo(() =>
    Object.values(customWeights).reduce((s, v) => s + v, 0),
    [customWeights]
  );

  const mutation = useMutation({
    mutationFn: () => api.rebalance(symbols, targetWeights, portfolioValue),
  });

  const data = mutation.data;

  return (
    <BentoCard title="Portfolio Rebalancer" className="col-span-full">
      <div className="space-y-4">
        {/* Controls row */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] text-ink-500 uppercase">Portfolio Value</label>
            <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <DollarSign size={14} className="text-ink-500" />
              <input
                type="number" value={portfolioValue}
                onChange={(e) => setPortfolioValue(Number(e.target.value))}
                className="w-28 bg-transparent text-sm text-ink-100 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase">Strategy</label>
            <div className="mt-1 flex gap-1">
              {(["equal", "custom"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStrategy(s);
                    if (s === "custom" && Object.keys(customWeights).length === 0) {
                      const w = Math.round(10000 / symbols.length) / 100;
                      setCustomWeights(Object.fromEntries(symbols.map((sym) => [sym, w])));
                    }
                  }}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium transition border capitalize",
                    strategy === s
                      ? "bg-crimson-500/15 border-crimson-500/20 text-crimson-300"
                      : "border-white/10 text-ink-400 hover:text-ink-200"
                  )}
                >
                  {s} Weight
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (strategy === "custom" && Math.abs(totalCustom - 100) > 1)}
            className="flex items-center gap-2 rounded-xl bg-crimson-500/15 px-5 py-2.5 text-sm font-medium text-crimson-300 transition hover:bg-crimson-500/25 disabled:opacity-40"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />}
            Analyze Drift
          </button>
        </div>

        {/* Custom weights editor */}
        {strategy === "custom" && (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-8">
            {symbols.map((sym) => (
              <div key={sym} className="rounded-lg border border-white/10 bg-white/5 p-2">
                <span className="text-[10px] text-ink-500">{sym}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} max={100} step={1}
                    value={customWeights[sym] ?? 0}
                    onChange={(e) => setCustomWeights({ ...customWeights, [sym]: Number(e.target.value) })}
                    className="w-full bg-transparent text-sm text-ink-100 outline-none"
                  />
                  <span className="text-[10px] text-ink-500">%</span>
                </div>
              </div>
            ))}
            <div className={cn(
              "rounded-lg border p-2 flex flex-col items-center justify-center",
              Math.abs(totalCustom - 100) < 1
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-red-500/20 bg-red-500/5"
            )}>
              <span className="text-[10px] text-ink-500">Total</span>
              <span className={cn(
                "text-sm font-semibold",
                Math.abs(totalCustom - 100) < 1 ? "text-emerald-400" : "text-red-400"
              )}>
                {totalCustom.toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* Results */}
        {data && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard
                label="Status"
                value={data.summary.needs_rebalance ? "Needs Rebalance" : "Balanced"}
                icon={data.summary.needs_rebalance ? AlertTriangle : CheckCircle2}
                color={data.summary.needs_rebalance ? "amber" : "emerald"}
              />
              <SummaryCard label="Max Drift" value={`${data.summary.max_drift_pct}%`}
                icon={Scale} color={data.summary.max_drift_pct > 5 ? "red" : "emerald"} />
              <SummaryCard label="Trades Needed" value={String(data.summary.num_trades)}
                icon={ArrowUpCircle} color="blue" />
              <SummaryCard label="Turnover" value={`${data.summary.turnover_pct.toFixed(1)}%`}
                icon={DollarSign} color="purple" />
            </div>

            {/* Drift chart */}
            <div className="grid gap-4 lg:grid-cols-2">
              <BentoCard title="Drift Analysis">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.assets} layout="vertical" margin={{ left: 60, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="symbol" tick={{ fill: "#9ca3af", fontSize: 11 }} width={55} />
                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                      formatter={(v: number) => [`${v.toFixed(2)}%`, "Drift"]}
                    />
                    <Bar dataKey="drift_pct" radius={[0, 4, 4, 0]}>
                      {data.assets.map((a: any, i: number) => (
                        <Cell key={i} fill={a.drift_pct > 0 ? "#ef4444" : a.drift_pct < 0 ? "#10b981" : "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </BentoCard>

              {/* Trade suggestions */}
              <BentoCard title="Suggested Trades">
                {data.trades.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <CheckCircle2 size={28} className="mx-auto text-emerald-400" />
                      <p className="mt-2 text-sm text-ink-400">Portfolio is balanced</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {data.trades.map((t: any, i: number) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-3",
                          t.action === "BUY"
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-red-500/20 bg-red-500/5"
                        )}
                      >
                        {t.action === "BUY" ? (
                          <ArrowUpCircle size={18} className="text-emerald-400" />
                        ) : (
                          <ArrowDownCircle size={18} className="text-red-400" />
                        )}
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-ink-100">{t.symbol}</span>
                          <span className={cn(
                            "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            t.action === "BUY" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                          )}>
                            {t.action}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-ink-200">
                            {t.shares.toFixed(1)} shares
                          </p>
                          <p className="text-[10px] text-ink-500">${t.value.toFixed(0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </BentoCard>
            </div>

            {/* Full asset table */}
            <BentoCard title="All Assets">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-ink-500">
                      <th className="pb-2 text-left">Symbol</th>
                      <th className="pb-2 text-right">Price</th>
                      <th className="pb-2 text-right">Target %</th>
                      <th className="pb-2 text-right">Current %</th>
                      <th className="pb-2 text-right">Drift</th>
                      <th className="pb-2 text-right">Target $</th>
                      <th className="pb-2 text-right">Current $</th>
                      <th className="pb-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assets.map((a: any) => (
                      <tr key={a.symbol} className="border-b border-white/5">
                        <td className="py-2 font-medium text-ink-200">{a.symbol}</td>
                        <td className="py-2 text-right text-ink-300">${a.price?.toFixed(2)}</td>
                        <td className="py-2 text-right text-ink-300">{a.target_weight}%</td>
                        <td className="py-2 text-right text-ink-300">{a.current_weight}%</td>
                        <td className={cn("py-2 text-right font-medium",
                          a.drift_pct > 2 ? "text-red-400" : a.drift_pct < -2 ? "text-emerald-400" : "text-ink-400"
                        )}>
                          {a.drift_pct > 0 ? "+" : ""}{a.drift_pct}%
                        </td>
                        <td className="py-2 text-right text-ink-300">${a.target_value?.toFixed(0)}</td>
                        <td className="py-2 text-right text-ink-300">${a.current_value?.toFixed(0)}</td>
                        <td className="py-2 text-center">
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            a.action === "BUY" ? "bg-emerald-500/20 text-emerald-300"
                              : a.action === "SELL" ? "bg-red-500/20 text-red-300"
                              : "bg-white/10 text-ink-400"
                          )}>
                            {a.action}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BentoCard>
          </motion.div>
        )}
      </div>
    </BentoCard>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: any; color: string;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/15",
    amber: "text-amber-400 bg-amber-500/15",
    red: "text-red-400 bg-red-500/15",
    blue: "text-blue-400 bg-blue-500/15",
    purple: "text-purple-400 bg-purple-500/15",
  };
  const [text, bg] = (colors[color] || colors.blue).split(" ");
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
      <Icon size={18} className={cn("mx-auto", text)} />
      <p className="mt-1.5 text-lg font-bold text-ink-100">{value}</p>
      <p className="text-[10px] text-ink-500">{label}</p>
    </div>
  );
}
