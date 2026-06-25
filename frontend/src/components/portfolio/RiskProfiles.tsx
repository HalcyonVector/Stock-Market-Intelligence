"use client";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface ProfileData {
  label: string;
  color: string;
  lambda: number;
  target_vol: number;
  annual_return: number;
  annual_volatility: number;
  sharpe: number;
  sortino: number;
  cvar_95: number;
  max_drawdown: number;
  holdings: { symbol: string; weight: number }[];
}

interface Props {
  profiles: Record<string, ProfileData>;
}

const ORDER = ["ultra_aggressive", "aggressive", "growth", "balanced", "moderate", "conservative", "ultra_safe"];

export function RiskProfiles({ profiles }: Props) {
  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Risk Profiles"
      subtitle="Utility-optimized (scipy SLSQP)">
      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
        {ORDER.map((key) => {
          const p = profiles[key];
          if (!p) return null;
          return (
            <div key={key} className="rounded-xl border border-white/5 bg-black/20 p-3 transition hover:border-white/10">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium">{p.label}</span>
                </span>
                <span className="text-[10px] text-ink-500">λ={p.lambda} · σ target={p.target_vol * 100}%</span>
              </div>

              {/* Metrics grid */}
              <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                <div>
                  <span className="text-ink-500">Return</span>
                  <p className="font-mono font-semibold" style={{ color: p.color }}>
                    {(p.annual_return * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <span className="text-ink-500">Vol</span>
                  <p className="font-mono font-semibold text-ink-300">{(p.annual_volatility * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-ink-500">Sharpe</span>
                  <p className={cn("font-mono font-semibold", p.sharpe >= 1 ? "text-emerald-400" : "text-ink-300")}>
                    {p.sharpe.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-ink-500">Sortino</span>
                  <p className="font-mono text-ink-300">{p.sortino.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-ink-500">CVaR</span>
                  <p className="font-mono text-crimson-300">{(p.cvar_95 * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-ink-500">Max DD</span>
                  <p className="font-mono text-crimson-300">{(p.max_drawdown * 100).toFixed(1)}%</p>
                </div>
              </div>

              {/* Weight bar */}
              <div className="mt-2">
                <div className="flex h-1.5 overflow-hidden rounded-full">
                  {p.holdings.map((h, i) => (
                    <div
                      key={h.symbol}
                      className="h-full transition-all"
                      style={{
                        width: `${h.weight * 100}%`,
                        backgroundColor: p.color,
                        opacity: 1 - i * 0.08,
                      }}
                      title={`${h.symbol}: ${(h.weight * 100).toFixed(1)}%`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {p.holdings.slice(0, 4).map((h) => (
                    <span key={h.symbol} className="text-[9px] text-ink-500">
                      {h.symbol} {(h.weight * 100).toFixed(0)}%
                    </span>
                  ))}
                  {p.holdings.length > 4 && (
                    <span className="text-[9px] text-ink-700">+{p.holdings.length - 4}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}
