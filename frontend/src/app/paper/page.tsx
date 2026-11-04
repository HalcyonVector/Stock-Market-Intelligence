"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Loader2, RotateCcw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { toast } from "@/components/ui/Toaster";
import { cn, changeColor, pct, money, currencySymbol } from "@/lib/utils";

const SUGGESTIONS = ["AAPL", "MSFT", "NVDA", "TSLA", "RELIANCE.NS", "TCS.NS", "INFY.NS"];

function fmtMoney(v: number, cur: string) {
  const sym = cur === "INR" ? "₹" : "$";
  return `${v < 0 ? "-" : ""}${sym}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function AccountCard({ cur, a }: { cur: string; a: any }) {
  return (
    <BentoCard span="col-span-12 md:col-span-6" title={cur === "INR" ? "India account (₹)" : "US account ($)"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-500">Total value</p>
          <p className="font-mono text-2xl font-bold text-ink-100">{fmtMoney(a.equity, cur)}</p>
          <p className={cn("font-mono text-xs", changeColor(a.total_return_pct))}>
            {pct(a.total_return_pct)} since start ({fmtMoney(a.starting_cash, cur)})
          </p>
        </div>
        <dl className="space-y-0.5 text-right text-xs">
          <div><dt className="inline text-ink-500">Cash </dt><dd className="inline font-mono text-ink-200">{fmtMoney(a.cash, cur)}</dd></div>
          <div><dt className="inline text-ink-500">Invested </dt><dd className="inline font-mono text-ink-200">{fmtMoney(a.market_value, cur)}</dd></div>
        </dl>
      </div>
    </BentoCard>
  );
}

function OrderTicket({ initialSymbol, accounts }: { initialSymbol: string; accounts: any }) {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState<number | "">(1);
  useEffect(() => { if (initialSymbol) setSymbol(initialSymbol); }, [initialSymbol]);

  const sym = symbol.trim().toUpperCase();
  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ["quote", sym],
    queryFn: () => api.quote(sym),
    enabled: sym.length >= 1,
    retry: 0,
    staleTime: 60_000,
  });

  const order = useMutation({
    mutationFn: () => api.paperTrade(sym, side, Number(qty)),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["paper"] });
      toast(`${r.side === "buy" ? "Bought" : "Sold"} ${r.quantity} ${r.symbol}`, {
        body: `at ${money(r.price, r.symbol)}${r.side === "sell" ? ` · realized ${fmtMoney(r.realized_pnl, r.currency)}` : ""}`,
        tone: "success",
      });
    },
    onError: (e: Error) => toast("Order rejected", { body: e.message, tone: "error" }),
  });

  const cur = currencySymbol(sym) === "₹" ? "INR" : "USD";
  const est = quote?.price && qty ? quote.price * Number(qty) : null;
  const cash = accounts?.[cur]?.cash;

  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Place a practice order" subtitle="Fills instantly at the latest (delayed) price">
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Side" className="grid grid-cols-2 rounded-lg bg-white/5 p-0.5 text-sm">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className={cn(
                "rounded-md py-1.5 capitalize transition",
                side === s ? (s === "buy" ? "bg-emerald-500/20 text-emerald-300" : "bg-crimson-600/25 text-crimson-300") : "text-ink-400"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-400">
          Symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="AAPL or RELIANCE.NS"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-crimson-500/40"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setSymbol(s)} className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-ink-400 hover:text-ink-100">
              {s}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-400">
          Quantity
          <input
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-ink-100 outline-none focus:border-crimson-500/40"
          />
        </label>

        <div className="rounded-lg bg-white/[0.03] p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-ink-500">Price</span>
            <span className="font-mono text-ink-200">
              {quoting ? "…" : quote?.price ? money(quote.price, sym) : sym ? "not found" : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-500">Estimated {side === "buy" ? "cost" : "proceeds"}</span>
            <span className="font-mono text-ink-200">{est != null ? fmtMoney(est, cur) : "—"}</span>
          </div>
          {cash != null && (
            <div className="flex justify-between">
              <span className="text-ink-500">Cash available</span>
              <span className="font-mono text-ink-200">{fmtMoney(cash, cur)}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => order.mutate()}
          disabled={!sym || !qty || Number(qty) <= 0 || order.isPending}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-40",
            side === "buy" ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30" : "bg-crimson-600/25 text-crimson-200 hover:bg-crimson-600/35"
          )}
        >
          {order.isPending && <Loader2 size={14} className="animate-spin" />}
          {side === "buy" ? "Buy" : "Sell"} {sym || "…"}
        </button>
      </div>
    </BentoCard>
  );
}

export default function PaperTradingPage() {
  const qc = useQueryClient();
  const [initialSymbol, setInitialSymbol] = useState("");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("symbol");
    if (s) setInitialSymbol(s.toUpperCase());
  }, []);

  const { data, isLoading, error } = useQuery({ queryKey: ["paper"], queryFn: api.paperAccount });

  const reset = useMutation({
    mutationFn: api.paperReset,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper"] });
      toast("Paper account reset", { tone: "success" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet size={24} className="text-crimson-400" /> Paper Trading
          </h1>
          <p className="text-sm text-ink-500">
            Practice with virtual money — $100,000 and ₹10,00,000 to start. No real orders, no sign-up.
          </p>
        </div>
        <button
          onClick={() => { if (confirm("Reset your paper account? All positions and history will be cleared.")) reset.mutate(); }}
          disabled={reset.isPending}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-white/10"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center text-ink-500"><Loader2 className="animate-spin" /></div>
      )}
      {error && <p className="text-sm text-crimson-300">Couldn&apos;t load your paper account: {(error as Error).message}</p>}

      {data && (
        <div className="bento">
          {Object.entries(data.accounts).map(([cur, a]) => <AccountCard key={cur} cur={cur} a={a} />)}

          <OrderTicket initialSymbol={initialSymbol} accounts={data.accounts} />

          <BentoCard span="col-span-12 lg:col-span-8" title="Positions">
            {data.positions.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500">No positions yet. Place a buy order to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="text-ink-500">
                    <tr className="border-b border-white/5">
                      <th className="py-2 text-left font-medium">Symbol</th>
                      <th className="py-2 text-right font-medium">Qty</th>
                      <th className="py-2 text-right font-medium">Avg cost</th>
                      <th className="py-2 text-right font-medium">Price</th>
                      <th className="py-2 text-right font-medium">Value</th>
                      <th className="py-2 text-right font-medium">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p: any) => (
                      <tr key={p.symbol} className="border-b border-white/[0.03]">
                        <td className="py-2">
                          <Link href={`/stock/${p.symbol}`} className="font-mono font-medium text-ink-100 hover:text-crimson-300">{p.symbol}</Link>
                        </td>
                        <td className="py-2 text-right font-mono">{p.quantity}</td>
                        <td className="py-2 text-right font-mono text-ink-300">{money(p.avg_cost, p.symbol)}</td>
                        <td className="py-2 text-right font-mono text-ink-200" title={p.price_is_live ? "" : "Live price unavailable; showing cost"}>
                          {money(p.price, p.symbol)}{!p.price_is_live && "*"}
                        </td>
                        <td className="py-2 text-right font-mono text-ink-200">{fmtMoney(p.market_value, p.currency)}</td>
                        <td className={cn("py-2 text-right font-mono", changeColor(p.unrealized_pnl))}>
                          {fmtMoney(p.unrealized_pnl, p.currency)} ({pct(p.unrealized_pnl_pct)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BentoCard>

          <BentoCard span="col-span-12" title="Recent orders">
            {data.trades.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-500">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-white/[0.04] text-xs">
                {data.trades.map((t: any) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      {t.side === "buy" ? <ArrowUpRight size={14} className="text-emerald-400" /> : <ArrowDownRight size={14} className="text-crimson-400" />}
                      <span className="capitalize text-ink-300">{t.side}</span>
                      <span className="font-mono text-ink-100">{t.quantity} {t.symbol}</span>
                      <span className="text-ink-500">@ {money(t.price, t.symbol)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      {t.side === "sell" && (
                        <span className={cn("font-mono", changeColor(t.realized_pnl))}>{fmtMoney(t.realized_pnl, t.currency)}</span>
                      )}
                      <span className="text-ink-500">{t.ts ? new Date(t.ts).toLocaleString() : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>

          <p className="col-span-12 text-[11px] text-ink-500">{data.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
