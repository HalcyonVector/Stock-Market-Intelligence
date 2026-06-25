"use client";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";
import { AlertTriangle, Shield, TrendingDown } from "lucide-react";

interface ScenarioResult {
  scenario: string;
  description: string;
  duration_days: number;
  market_shock_pct: number;
  portfolio_shock_pct: number;
  avg_trough_pct: number;
  worst_case_pct: number;
  recovery_prob_pct: number;
  avg_final_value: number;
  median_final_value: number;
}

interface Props {
  stressTests: ScenarioResult[];
}

function severity(shockPct: number): { icon: typeof AlertTriangle; color: string; bg: string } {
  if (shockPct < -30) return { icon: AlertTriangle, color: "text-crimson-400", bg: "bg-crimson-600/10" };
  if (shockPct < -15) return { icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10" };
  return { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10" };
}

export function StressTest({ stressTests }: Props) {
  return (
    <BentoCard span="col-span-12" title="Stress Testing"
      subtitle="Portfolio behavior under historical crash scenarios (Max Sharpe allocation)">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {stressTests.map((s) => {
          const sev = severity(s.portfolio_shock_pct);
          const Icon = sev.icon;
          return (
            <div key={s.scenario} className={cn("rounded-xl border border-white/5 p-4 transition hover:border-white/10", sev.bg)}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                    <Icon size={14} className={sev.color} />
                    {s.scenario}
                  </h4>
                  <p className="mt-0.5 text-[10px] text-ink-500">{s.description}</p>
                </div>
                <span className="text-[10px] text-ink-500">{s.duration_days}d</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-ink-500">Market</span>
                  <span className="font-mono text-crimson-400">{s.market_shock_pct.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Portfolio</span>
                  <span className="font-mono text-crimson-400">{s.portfolio_shock_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Avg Trough</span>
                  <span className="font-mono text-crimson-300">{s.avg_trough_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Worst Case</span>
                  <span className="font-mono text-crimson-400">{s.worst_case_pct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Recovery</span>
                  <span className={cn("font-mono", s.recovery_prob_pct > 70 ? "text-emerald-400" : "text-amber-400")}>
                    {s.recovery_prob_pct}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">Median Final</span>
                  <span className="font-mono text-ink-300">${s.median_final_value.toLocaleString()}</span>
                </div>
              </div>

              {/* Visual severity bar */}
              <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", sev.color.replace("text-", "bg-"))}
                  style={{ width: `${Math.min(100, Math.abs(s.portfolio_shock_pct) * 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}
