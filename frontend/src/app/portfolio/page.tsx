"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { PortfolioBuilder } from "@/components/portfolio/PortfolioBuilder";
import { EfficientFrontier } from "@/components/portfolio/EfficientFrontier";
import { StrategyComparison } from "@/components/portfolio/StrategyComparison";
import { RiskProfiles } from "@/components/portfolio/RiskProfiles";
import { MonteCarloChart } from "@/components/portfolio/MonteCarloChart";
import { StressTest } from "@/components/portfolio/StressTest";
import { BacktestChart } from "@/components/portfolio/BacktestChart";
import { CorrelationHeatmap } from "@/components/portfolio/CorrelationHeatmap";
import { AssetTable } from "@/components/portfolio/AssetTable";
import { Rebalancer } from "@/components/portfolio/Rebalancer";

const DEFAULT_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM",
  "V", "JNJ", "WMT", "PG", "XOM", "UNH", "HD",
];

export default function PortfolioPage() {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [analyzeSymbols, setAnalyzeSymbols] = useState<string[] | null>(null);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["portfolio", analyzeSymbols],
    queryFn: () => api.portfolio(analyzeSymbols ?? undefined),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: analyzeSymbols !== null,
  });

  const handleAnalyze = (syms: string[]) => {
    setSelectedSymbols(syms);
    setAnalyzeSymbols(syms);
  };

  const strategyColors: Record<string, string> = {};
  if (data?.strategies) {
    for (const [key, s] of Object.entries(data.strategies) as [string, any][]) {
      strategyColors[key] = s.color;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Briefcase size={24} className="text-crimson-400" /> Portfolio Optimizer
        </h1>
        <p className="text-sm text-ink-500">
          Mean-variance optimization · scipy SLSQP · fat-tail Monte Carlo · stress testing
        </p>
      </div>

      {/* Interactive builder */}
      <PortfolioBuilder
        onAnalyze={handleAnalyze}
        isAnalyzing={isLoading || isFetching}
        currentSymbols={selectedSymbols}
      />

      {/* Results */}
      {(isLoading || isFetching) && (
        <div className="flex h-60 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-ink-500">
            <Loader2 size={36} className="animate-spin text-crimson-400" />
            <p className="text-sm font-medium">Running portfolio optimization…</p>
            <div className="space-y-0.5 text-center text-xs text-ink-500">
              <p>Fetching {selectedSymbols.length} asset histories (252 days)</p>
              <p>15,000-point Monte Carlo cloud + optimizer-traced frontier</p>
              <p>2,000-path Student-t fat-tail growth simulation</p>
              <p>6 historical crash stress tests · 5 strategy backtests</p>
            </div>
          </div>
        </div>
      )}

      {!isLoading && !isFetching && (error || data?.error) && (
        <div className="flex items-center gap-3 rounded-2xl border border-crimson-500/20 bg-crimson-600/5 p-6">
          <AlertCircle className="shrink-0 text-crimson-400" />
          <div>
            <p className="text-sm font-medium text-crimson-300">Portfolio analysis failed</p>
            <p className="text-xs text-ink-500">
              {data?.error || "Backend unreachable. Make sure Docker is running with numpy/scipy installed."}
            </p>
          </div>
        </div>
      )}

      {!isLoading && !isFetching && data && !data.error && (
        <>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-xs text-ink-500">
            {data.n_assets} assets analyzed · {data.data_days} trading days · rf={data.risk_free_rate * 100}% ·
            Generated {new Date(data.generated_at).toLocaleTimeString()}
          </div>
          <div className="bento">
            <EfficientFrontier frontier={data.frontier} strategies={data.strategies} />
            <RiskProfiles profiles={data.profiles} />
            <StrategyComparison strategies={data.strategies} />
            <MonteCarloChart monteCarlo={data.monte_carlo} />
            <CorrelationHeatmap correlation={data.correlation} />
            <StressTest stressTests={data.stress_tests} />
            <BacktestChart backtests={data.backtests} strategyColors={strategyColors} />
            <AssetTable assets={data.assets} />
          </div>

          {/* Rebalancer */}
          <Rebalancer symbols={selectedSymbols} />
        </>
      )}

      {analyzeSymbols === null && (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/10">
          <p className="text-sm text-ink-500">Select assets above and click <span className="text-crimson-400">Analyze</span> to run optimization</p>
        </div>
      )}
    </div>
  );
}
