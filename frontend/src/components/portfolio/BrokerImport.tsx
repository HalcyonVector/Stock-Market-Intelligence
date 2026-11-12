"use client";
import { useRef, useState } from "react";
import { FileUp, Loader2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { parseHoldingsCsv } from "@/lib/holdingsCsv";
import { BentoCard } from "@/components/ui/BentoCard";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cn, pct } from "@/lib/utils";

const fmt = (v: number | null | undefined, cur: string) =>
  v == null ? "-" : `${cur === "INR" ? "₹" : "$"}${Math.round(v).toLocaleString(cur === "INR" ? "en-IN" : "en-US")}`;

/** Upload a broker holdings CSV, see what it's worth now, then send the
 *  stocks into the optimizer below. The file is read in the browser only. */
export function BrokerImport({ onAnalyze }: { onAnalyze: (symbols: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [market, setMarket] = useState<"IN" | "US">("IN");
  const [result, setResult] = useState<any>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File) => {
    setBusy(true); setResult(null);
    try {
      const { holdings, warnings } = parseHoldingsCsv(await f.text());
      setWarnings(warnings);
      if (holdings.length) setResult(await api.holdingsValue(market, holdings));
    } catch (e: any) {
      setWarnings([`Couldn't value the holdings: ${e?.message ?? "unknown error"}`]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rows: any[] = result?.rows ?? [];
  const priced = rows.filter((r) => r.value != null).map((r) => r.symbol);

  return (
    <BentoCard span="col-span-12" title="Analyse your own holdings"
      subtitle="Import a holdings CSV from your broker (Zerodha, Upstox, Groww with symbols, or any CSV with symbol, quantity and average cost)">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-xs">
          {(["IN", "US"] as const).map((m) => (
            <button key={m} onClick={() => setMarket(m)}
              className={cn("rounded-md px-2.5 py-1", market === m ? "bg-white/10 text-ink-100" : "text-ink-400")}>
              {m === "IN" ? "Indian broker" : "US broker"}
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-crimson-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-crimson-500 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Choose CSV
        </button>
        <span className="flex items-center gap-1 text-[11px] text-ink-500">
          <Info size={12} /> Read in your browser; only tickers and quantities are sent to price them, and nothing is saved.
        </span>
      </div>

      {warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-300/90">{w}</p>)}

      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.totals).map(([cur, t]: [string, any]) => (
              <div key={cur} className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-ink-500">{cur} holdings</p>
                <p className="font-mono text-lg font-semibold">{fmt(t.value, cur)}</p>
                <p className={cn("text-[11px]", (t.pnl_pct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {t.pnl_pct != null ? `${pct(t.pnl_pct)} on ${fmt(t.invested, cur)} invested` : "no cost data"}
                  {t.unpriced ? <span className="text-ink-500"> · {t.unpriced} not priced yet</span> : null}
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead className="text-ink-500">
                <tr className="border-b border-white/5">
                  <th className="py-2 text-left font-medium">Stock</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Avg cost</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Value</th>
                  <th className="py-2 text-right font-medium">Weight</th>
                  <th className="py-2 text-right font-medium">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-white/[0.03]">
                    <td className="py-1.5 font-mono font-medium">
                      {r.symbol} {r.price_source && <SourceBadge source={r.price_source} className="ml-1" />}
                    </td>
                    <td className="py-1.5 text-right font-mono">{r.quantity}</td>
                    <td className="py-1.5 text-right font-mono text-ink-400">{fmt(r.avg_cost, r.currency)}</td>
                    <td className="py-1.5 text-right font-mono">{r.price != null ? fmt(r.price, r.currency) : <span className="text-ink-500" title="No free price yet; it's added to the next daily sync">pending</span>}</td>
                    <td className="py-1.5 text-right font-mono">{fmt(r.value, r.currency)}</td>
                    <td className="py-1.5 text-right font-mono text-ink-400">{r.weight_pct != null ? `${r.weight_pct.toFixed(1)}%` : "-"}</td>
                    <td className={cn("py-1.5 text-right font-mono", (r.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {r.pnl_pct != null ? pct(r.pnl_pct) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {priced.length >= 2 && (
            <button onClick={() => onAnalyze(priced.slice(0, 30))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-200 hover:bg-white/5">
              Run the optimizer, risk and stress tests on these {Math.min(priced.length, 30)} stocks
            </button>
          )}
        </div>
      )}
    </BentoCard>
  );
}
