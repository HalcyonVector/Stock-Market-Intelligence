"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { PriceChart } from "./PriceChart";
import { WhyMovingCard } from "./WhyMovingCard";
import { TechnicalIndicators } from "./TechnicalIndicators";
import { FundamentalsCard } from "./FundamentalsCard";
import { DeepResearch } from "./DeepResearch";
import { PriceForecast } from "./PriceForecast";
import { pct, changeColor, cn } from "@/lib/utils";

export function StockIntelligence({ symbol }: { symbol: string }) {
  const { data } = useQuery({ queryKey: ["stock", symbol], queryFn: () => api.stock(symbol) });
  const { data: movers } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  const q = data?.quote;
  const p = data?.profile;

  const allStocks = [...(movers?.gainers ?? []), ...(movers?.losers ?? [])];
  const peers = allStocks.filter((s: any) => s.symbol !== symbol).slice(0, 6);

  const volRatio = q?.volume && q?.avg_volume ? (q.volume / q.avg_volume).toFixed(2) : null;

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-100 transition">
        <ArrowLeft size={14} /> Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-bold">{symbol}</h1>
            {q && (
              <span className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-mono",
                q.change_pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-crimson-600/10 text-crimson-400"
              )}>
                {q.change_pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {pct(q.change_pct)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-500">{p?.name} · {p?.sector} · {p?.industry}</p>
        </div>
        {q && (
          <div className="text-right">
            <p className="font-mono text-3xl font-bold">{q.currency} {q.price?.toFixed(2)}</p>
            <p className="text-xs text-ink-500">
              Change: <span className={changeColor(q.change)}>{q.change >= 0 ? "+" : ""}{q.change?.toFixed(2)}</span>
              {volRatio && <span className="ml-2">Vol: <span className={cn("font-mono", parseFloat(volRatio) > 1.5 ? "text-crimson-400" : "text-ink-300")}>{volRatio}x</span></span>}
            </p>
          </div>
        )}
      </div>

      <div className="bento">
        {/* Price chart */}
        <BentoCard span="col-span-12 lg:col-span-8" title="Price & Volume (90d)">
          <PriceChart symbol={symbol} />
        </BentoCard>

        {/* Key metrics */}
        <BentoCard span="col-span-12 lg:col-span-4" title="Key Metrics">
          <dl className="space-y-1.5 text-xs">
            <Row k="Market" v={p?.market} />
            <Row k="Sector" v={p?.sector} />
            <Row k="Industry" v={p?.industry} />
            <Row k="Market Cap" v={q?.market_cap ? `$${(Number(q.market_cap) / 1e9).toFixed(1)}B` : "—"} />
            <Row k="Volume" v={q?.volume?.toLocaleString()} />
            <Row k="Avg Volume" v={q?.avg_volume?.toLocaleString()} />
          </dl>
        </BentoCard>

        {/* AI explanation */}
        <WhyMovingCard symbol={symbol} />

        {/* News */}
        <BentoCard span="col-span-12 lg:col-span-4" title="Recent News">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(data?.news ?? []).slice(0, 8).map((n: any, i: number) => (
              <a key={i} href={n.url} target="_blank" rel="noreferrer"
                className="group block rounded-lg p-2 transition hover:bg-white/5">
                <p className="text-xs text-ink-100 group-hover:text-crimson-300 transition line-clamp-2">
                  {n.headline}
                  <ExternalLink size={10} className="ml-1 inline opacity-0 group-hover:opacity-100" />
                </p>
                <p className="mt-0.5 text-[10px] text-ink-500">{n.source}</p>
              </a>
            ))}
          </div>
        </BentoCard>

        {/* Technical indicators */}
        <TechnicalIndicators symbol={symbol} />

        {/* Fundamentals */}
        <FundamentalsCard symbol={symbol} />

        {/* ML Price Forecast */}
        <PriceForecast symbol={symbol} />

        {/* AI Deep Research */}
        <DeepResearch symbol={symbol} />

        {/* Peers */}
        <BentoCard span="col-span-12" title="Market Peers">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            {peers.map((peer: any) => (
              <Link key={peer.symbol} href={`/stock/${peer.symbol}`}
                className="rounded-xl border border-white/5 bg-black/20 p-3 transition hover:border-crimson-500/20">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium">{peer.symbol}</span>
                  <span className={cn("text-xs font-mono", changeColor(peer.change_pct))}>{pct(peer.change_pct)}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">${peer.price?.toFixed(2)}</p>
              </Link>
            ))}
          </div>
        </BentoCard>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between border-b border-white/[0.03] pb-1">
      <dt className="text-ink-500">{k}</dt>
      <dd className="font-mono text-ink-100">{v ?? "—"}</dd>
    </div>
  );
}
