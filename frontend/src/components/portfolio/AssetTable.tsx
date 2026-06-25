"use client";
import Link from "next/link";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface AssetStat {
  symbol: string;
  annual_return: number;
  annual_volatility: number;
  sharpe: number;
  sortino: number;
  cvar_95: number;
  max_drawdown: number;
  calmar: number;
  skewness: number;
  kurtosis: number;
  best_day: number;
  worst_day: number;
  positive_days_pct: number;
}

interface Props {
  assets: AssetStat[];
}

export function AssetTable({ assets }: Props) {
  const sorted = [...assets].sort((a, b) => b.sharpe - a.sharpe);

  return (
    <BentoCard span="col-span-12" title="Individual Asset Analytics"
      subtitle="Comprehensive risk-return profile for each asset">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/5 text-ink-500">
              <th className="py-2 text-left font-medium sticky left-0 bg-base-950/80">Asset</th>
              <th className="py-2 text-right font-medium px-2">Return</th>
              <th className="py-2 text-right font-medium px-2">Vol</th>
              <th className="py-2 text-right font-medium px-2">Sharpe</th>
              <th className="py-2 text-right font-medium px-2">Sortino</th>
              <th className="py-2 text-right font-medium px-2">CVaR 95</th>
              <th className="py-2 text-right font-medium px-2">Max DD</th>
              <th className="py-2 text-right font-medium px-2">Calmar</th>
              <th className="py-2 text-right font-medium px-2">Skew</th>
              <th className="py-2 text-right font-medium px-2">Kurt</th>
              <th className="py-2 text-right font-medium px-2">Best</th>
              <th className="py-2 text-right font-medium px-2">Worst</th>
              <th className="py-2 text-right font-medium px-2">Win%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.symbol} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-1.5 sticky left-0 bg-base-950/80">
                  <Link href={`/stock/${a.symbol}`} className="font-mono font-medium text-ink-100 hover:text-crimson-300">
                    {a.symbol}
                  </Link>
                </td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.annual_return >= 0 ? "text-emerald-400" : "text-crimson-400")}>
                  {(a.annual_return * 100).toFixed(1)}%
                </td>
                <td className="py-1.5 text-right font-mono text-ink-300 px-2">{(a.annual_volatility * 100).toFixed(1)}%</td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.sharpe >= 1 ? "text-emerald-400" : a.sharpe >= 0 ? "text-ink-300" : "text-crimson-400")}>
                  {a.sharpe.toFixed(2)}
                </td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.sortino >= 1.5 ? "text-emerald-400" : "text-ink-300")}>
                  {a.sortino.toFixed(2)}
                </td>
                <td className="py-1.5 text-right font-mono text-crimson-300 px-2">{(a.cvar_95 * 100).toFixed(1)}%</td>
                <td className="py-1.5 text-right font-mono text-crimson-300 px-2">{(a.max_drawdown * 100).toFixed(1)}%</td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.calmar >= 1 ? "text-emerald-400" : "text-ink-300")}>
                  {a.calmar.toFixed(2)}
                </td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.skewness > 0 ? "text-emerald-400" : "text-crimson-300")}>
                  {a.skewness.toFixed(2)}
                </td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.kurtosis > 3 ? "text-amber-400" : "text-ink-300")}>
                  {a.kurtosis.toFixed(1)}
                </td>
                <td className="py-1.5 text-right font-mono text-emerald-400 px-2">+{(a.best_day * 100).toFixed(1)}%</td>
                <td className="py-1.5 text-right font-mono text-crimson-400 px-2">{(a.worst_day * 100).toFixed(1)}%</td>
                <td className={cn("py-1.5 text-right font-mono px-2", a.positive_days_pct > 52 ? "text-emerald-400" : "text-ink-300")}>
                  {a.positive_days_pct.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}
