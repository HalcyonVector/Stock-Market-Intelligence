"use client";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { GitCompare, Plus, X, Loader2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn, pct, changeColor } from "@/lib/utils";

const COLORS = ["#ff3b5c", "#6ee7b7", "#fbbf24", "#8b5cf6", "#38bdf8", "#f472b6"];

function fmt(v: any, type: "pct" | "usd" | "ratio" = "ratio"): string {
  if (v === null || v === undefined) return "—";
  if (type === "pct") return `${(Number(v) * 100).toFixed(1)}%`;
  if (type === "usd") {
    const n = Number(v);
    if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  }
  return Number(v).toFixed(2);
}

export default function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>(["AAPL", "MSFT", "GOOGL"]);
  const [input, setInput] = useState("");

  const addSymbol = (s: string) => {
    const sym = s.trim().toUpperCase();
    if (sym && !symbols.includes(sym) && symbols.length < 6) {
      setSymbols([...symbols, sym]);
    }
  };

  // Fetch fundamentals + candles for all symbols
  const fundQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["fundamentals", s],
      queryFn: () => api.fundamentals(s),
      staleTime: 10 * 60 * 1000,
    })),
  });

  const candleQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["candles-compare", s],
      queryFn: () => api.candles(s, "1d", 180),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const techQueries = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ["technicals", s],
      queryFn: () => api.technicals(s),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const allLoaded = fundQueries.every((q) => !q.isLoading) && candleQueries.every((q) => !q.isLoading);

  // Build normalized price chart data (base 100)
  const priceData: any[] = [];
  if (allLoaded) {
    // Find shortest candle array length
    const lengths = candleQueries.map((q) => (q.data ?? []).length).filter((l) => l > 0);
    const minLen = Math.min(...lengths, 180);

    for (let i = 0; i < minLen; i++) {
      const point: any = {};
      candleQueries.forEach((q, idx) => {
        const candles = q.data ?? [];
        if (candles.length > 0 && i < candles.length) {
          const base = candles[0]?.close || 1;
          point[symbols[idx]] = ((candles[i]?.close || base) / base) * 100;
          if (i === 0 || i % 5 === 0) {
            const ts = candles[i]?.ts;
            if (ts && !point.t) point.t = String(ts).slice(5, 10);
          }
        }
      });
      if (!point.t) point.t = String(i);
      priceData.push(point);
    }
  }

  // Fundamentals comparison rows
  const METRICS = [
    { key: "market_cap", label: "Market Cap", fmt: "usd" as const },
    { key: "pe_trailing", label: "P/E (TTM)", fmt: "ratio" as const },
    { key: "pe_forward", label: "P/E (Fwd)", fmt: "ratio" as const },
    { key: "peg_ratio", label: "PEG", fmt: "ratio" as const },
    { key: "price_to_book", label: "P/B", fmt: "ratio" as const },
    { key: "revenue", label: "Revenue", fmt: "usd" as const },
    { key: "revenue_growth", label: "Rev Growth", fmt: "pct" as const },
    { key: "gross_margins", label: "Gross Margin", fmt: "pct" as const },
    { key: "profit_margins", label: "Profit Margin", fmt: "pct" as const },
    { key: "debt_to_equity", label: "D/E Ratio", fmt: "ratio" as const },
    { key: "dividend_yield", label: "Div Yield", fmt: "pct" as const },
    { key: "beta", label: "Beta", fmt: "ratio" as const },
    { key: "eps_trailing", label: "EPS (TTM)", fmt: "ratio" as const },
    { key: "recommendation", label: "Analyst", fmt: "ratio" as const },
  ];

  const tooltipStyle = {
    background: "rgba(10,5,6,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <GitCompare size={24} className="text-crimson-400" /> Stock Comparison
        </h1>
        <p className="text-sm text-ink-500">Compare up to 6 stocks side-by-side</p>
      </div>

      {/* Symbol selector */}
      <BentoCard span="col-span-12" title="Select Stocks">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                input.split(",").forEach((s) => addSymbol(s));
                setInput("");
              }
            }}
            placeholder="Add ticker (max 6)"
            className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-ink-500 focus:border-crimson-500/40"
          />
          <button
            onClick={() => { input.split(",").forEach((s) => addSymbol(s)); setInput(""); }}
            disabled={symbols.length >= 6}
            className="rounded-lg border border-white/10 px-3 py-2 text-ink-300 hover:bg-white/5 transition disabled:opacity-30"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {symbols.map((s, i) => (
            <span key={s} className="group flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-mono">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
              {s}
              <button onClick={() => setSymbols(symbols.filter((x) => x !== s))} className="text-ink-500 hover:text-crimson-400">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </BentoCard>

      {!allLoaded && symbols.length > 0 && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-crimson-400" />
        </div>
      )}

      {allLoaded && symbols.length >= 2 && (
        <>
          {/* Normalized price chart */}
          <BentoCard span="col-span-12" title="Relative Performance (base 100)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceData}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "#8a7479", fontSize: 9 }} />
                <YAxis tick={{ fill: "#8a7479", fontSize: 9 }} width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {symbols.map((s, i) => (
                  <Line key={s} dataKey={s} stroke={COLORS[i]} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </BentoCard>

          {/* Technical signals comparison */}
          <BentoCard span="col-span-12" title="Technical Signals">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-ink-500">
                    <th className="py-2 text-left font-medium">Metric</th>
                    {symbols.map((s, i) => (
                      <th key={s} className="py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                          {s}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["RSI", "MACD Signal", "Stochastic %K", "Trend"].map((metric) => (
                    <tr key={metric} className="border-b border-white/[0.03]">
                      <td className="py-2 text-ink-500">{metric}</td>
                      {techQueries.map((q, i) => {
                        const signals = q.data?.signals ?? {};
                        let val = "—";
                        let signal = "";
                        if (metric === "RSI") { val = signals.rsi?.value?.toFixed(0) ?? "—"; signal = signals.rsi?.signal ?? ""; }
                        if (metric === "MACD Signal") { val = signals.macd?.value?.toFixed(2) ?? "—"; signal = signals.macd?.signal ?? ""; }
                        if (metric === "Stochastic %K") { val = signals.stochastic?.k?.toFixed(0) ?? "—"; signal = signals.stochastic?.signal ?? ""; }
                        if (metric === "Trend") { val = signals.trend?.above_sma20 ? "Above" : "Below"; signal = signals.trend?.signal ?? ""; }
                        return (
                          <td key={i} className={cn("py-2 text-right font-mono",
                            signal === "bullish" || signal === "neutral" ? "text-emerald-400"
                            : signal === "oversold" ? "text-amber-400"
                            : signal === "bearish" || signal === "overbought" ? "text-crimson-400"
                            : "text-ink-300"
                          )}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BentoCard>

          {/* Fundamentals table */}
          <BentoCard span="col-span-12" title="Fundamentals Comparison">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-ink-500">
                    <th className="py-2 text-left font-medium">Metric</th>
                    {symbols.map((s, i) => (
                      <th key={s} className="py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                          {s}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => (
                    <tr key={m.key} className="border-b border-white/[0.03]">
                      <td className="py-2 text-ink-500">{m.label}</td>
                      {fundQueries.map((q, i) => {
                        const v = q.data?.[m.key];
                        const display = m.key === "recommendation" ? (v || "—") : fmt(v, m.fmt);
                        return (
                          <td key={i} className="py-2 text-right font-mono text-ink-100">{display}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BentoCard>
        </>
      )}
    </div>
  );
}
