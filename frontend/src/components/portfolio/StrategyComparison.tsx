"use client";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface Strategy {
  name: string;
  color: string;
  annual_return: number;
  annual_volatility: number;
  sharpe: number;
  sortino: number;
  cvar_95: number;
  max_drawdown: number;
  calmar: number;
  holdings: { symbol: string; weight: number }[];
}

interface Props {
  strategies: Record<string, Strategy>;
}

const METRICS = [
  { key: "annual_return", label: "Return", fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: true },
  { key: "annual_volatility", label: "Volatility", fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: false },
  { key: "sharpe", label: "Sharpe", fmt: (v: number) => v.toFixed(2), higher: true },
  { key: "sortino", label: "Sortino", fmt: (v: number) => v.toFixed(2), higher: true },
  { key: "cvar_95", label: "CVaR 95%", fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: false },
  { key: "max_drawdown", label: "Max DD", fmt: (v: number) => `${(v * 100).toFixed(1)}%`, higher: false },
  { key: "calmar", label: "Calmar", fmt: (v: number) => v.toFixed(2), higher: true },
] as const;

export function StrategyComparison({ strategies }: Props) {
  const strats = Object.entries(strategies);

  return (
    <BentoCard span="col-span-12" title="Strategy Comparison"
      subtitle="Optimized allocation approaches with advanced risk metrics">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-2 text-left font-medium text-ink-500 w-24">Metric</th>
              {strats.map(([key, s]) => (
                <th key={key} className="py-2 text-center font-medium" style={{ color: s.color }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, label, fmt, higher }) => {
              const values = strats.map(([, s]) => (s as any)[key] as number);
              const best = higher ? Math.max(...values) : Math.min(...values);
              return (
                <tr key={key} className="border-b border-white/[0.03]">
                  <td className="py-2 text-ink-500">{label}</td>
                  {strats.map(([sKey, s]) => {
                    const val = (s as any)[key] as number;
                    const isBest = Math.abs(val - best) < 1e-6;
                    return (
                      <td key={sKey} className={cn("py-2 text-center font-mono", isBest ? "text-emerald-400 font-semibold" : "text-ink-300")}>
                        {fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Top holdings row */}
            <tr className="border-b border-white/[0.03]">
              <td className="py-2 text-ink-500">Top 3</td>
              {strats.map(([key, s]) => (
                <td key={key} className="py-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    {s.holdings.slice(0, 3).map((h) => (
                      <span key={h.symbol} className="text-[10px] text-ink-300">
                        {h.symbol} <span className="text-ink-500">{(h.weight * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}
