"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function fmt(v: any, type: "pct" | "usd" | "num" | "ratio" = "num"): string {
  if (v === null || v === undefined) return "—";
  if (type === "pct") return `${(Number(v) * 100).toFixed(1)}%`;
  if (type === "usd") {
    const n = Number(v);
    if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  }
  if (type === "ratio") return Number(v).toFixed(2);
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between border-b border-white/[0.03] py-1">
      <span className="text-ink-500">{k}</span>
      <span className={cn("font-mono", highlight ? "text-emerald-400" : "text-ink-100")}>{v}</span>
    </div>
  );
}

export function FundamentalsCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fundamentals", symbol],
    queryFn: () => api.fundamentals(symbol),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <BentoCard span="col-span-12 lg:col-span-4" title="Fundamentals">
        <div className="h-40 animate-pulse rounded-lg bg-white/5" />
      </BentoCard>
    );
  }

  if (data.error) {
    return (
      <BentoCard span="col-span-12 lg:col-span-4" title="Fundamentals">
        <p className="text-xs text-ink-500">{data.error}</p>
      </BentoCard>
    );
  }

  return (
    <>
      {/* Valuation */}
      <BentoCard span="col-span-12 lg:col-span-4" title="Valuation">
        <div className="space-y-0.5 text-xs">
          <Row k="Market Cap" v={fmt(data.market_cap, "usd")} />
          <Row k="Enterprise Value" v={fmt(data.enterprise_value, "usd")} />
          <Row k="P/E (TTM)" v={fmt(data.pe_trailing, "ratio")} />
          <Row k="P/E (Fwd)" v={fmt(data.pe_forward, "ratio")} />
          <Row k="PEG" v={fmt(data.peg_ratio, "ratio")} />
          <Row k="P/B" v={fmt(data.price_to_book, "ratio")} />
          <Row k="P/S" v={fmt(data.price_to_sales, "ratio")} />
          <Row k="EV/Revenue" v={fmt(data.ev_to_revenue, "ratio")} />
          <Row k="EV/EBITDA" v={fmt(data.ev_to_ebitda, "ratio")} />
        </div>
      </BentoCard>

      {/* Financials */}
      <BentoCard span="col-span-12 lg:col-span-4" title="Financials & Margins">
        <div className="space-y-0.5 text-xs">
          <Row k="Revenue" v={fmt(data.revenue, "usd")} />
          <Row k="Revenue/Share" v={`$${fmt(data.revenue_per_share, "ratio")}`} />
          <Row k="Revenue Growth" v={fmt(data.revenue_growth, "pct")} highlight={data.revenue_growth > 0} />
          <Row k="Earnings Growth" v={fmt(data.earnings_growth, "pct")} highlight={data.earnings_growth > 0} />
          <Row k="Gross Margin" v={fmt(data.gross_margins, "pct")} />
          <Row k="Operating Margin" v={fmt(data.operating_margins, "pct")} />
          <Row k="Profit Margin" v={fmt(data.profit_margins, "pct")} />
          <Row k="EPS (TTM)" v={`$${fmt(data.eps_trailing, "ratio")}`} />
          <Row k="EPS (Fwd)" v={`$${fmt(data.eps_forward, "ratio")}`} />
        </div>
      </BentoCard>

      {/* Balance Sheet + Analyst */}
      <BentoCard span="col-span-12 lg:col-span-4" title="Balance Sheet & Analyst">
        <div className="space-y-0.5 text-xs">
          <Row k="Cash" v={fmt(data.total_cash, "usd")} />
          <Row k="Debt" v={fmt(data.total_debt, "usd")} />
          <Row k="D/E Ratio" v={fmt(data.debt_to_equity, "ratio")} />
          <Row k="Current Ratio" v={fmt(data.current_ratio, "ratio")} />
          <Row k="Beta" v={fmt(data.beta, "ratio")} />
          <Row k="52W High" v={`$${fmt(data.fifty_two_week_high, "ratio")}`} />
          <Row k="52W Low" v={`$${fmt(data.fifty_two_week_low, "ratio")}`} />
          <Row k="Dividend Yield" v={fmt(data.dividend_yield, "pct")} />
          <Row k="Short Ratio" v={fmt(data.short_ratio, "ratio")} />
          {data.recommendation && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
              <span className="text-ink-500">Analyst Rating</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase",
                data.recommendation === "buy" || data.recommendation === "strong_buy" ? "bg-emerald-500/15 text-emerald-400"
                : data.recommendation === "sell" || data.recommendation === "strong_sell" ? "bg-crimson-600/15 text-crimson-400"
                : "bg-amber-500/10 text-amber-400"
              )}>
                {data.recommendation?.replace("_", " ")}
              </span>
            </div>
          )}
          {data.target_mean && (
            <Row k="Target (Mean)" v={`$${fmt(data.target_mean, "ratio")}`} />
          )}
        </div>
      </BentoCard>
    </>
  );
}
