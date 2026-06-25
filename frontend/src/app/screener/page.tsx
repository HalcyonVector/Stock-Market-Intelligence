"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Filter, Play, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn, pct, changeColor } from "@/lib/utils";

interface Filters {
  change_pct_min: string;
  change_pct_max: string;
  rsi_min: string;
  rsi_max: string;
  volume_ratio_min: string;
  pe_min: string;
  pe_max: string;
  market_cap_min: string;
  market_cap_max: string;
  sector: string;
}

const EMPTY: Filters = {
  change_pct_min: "", change_pct_max: "",
  rsi_min: "", rsi_max: "",
  volume_ratio_min: "",
  pe_min: "", pe_max: "",
  market_cap_min: "", market_cap_max: "",
  sector: "",
};

const PRESETS: { label: string; filters: Partial<Filters> }[] = [
  { label: "Oversold (RSI < 30)", filters: { rsi_max: "30" } },
  { label: "Overbought (RSI > 70)", filters: { rsi_min: "70" } },
  { label: "Volume Surge (>2x)", filters: { volume_ratio_min: "2" } },
  { label: "Value (P/E < 15)", filters: { pe_max: "15" } },
  { label: "Mega Cap (>200B)", filters: { market_cap_min: "200" } },
  { label: "Big Movers (>3%)", filters: { change_pct_min: "3" } },
];

const SECTORS = [
  "", "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Industrials", "Communication Services", "Consumer Defensive", "Energy",
  "Real Estate", "Utilities", "Basic Materials",
];

function FilterInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none placeholder:text-ink-600 focus:border-crimson-500/40 font-mono"
      />
    </div>
  );
}

export default function ScreenerPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [activeFilters, setActiveFilters] = useState<Record<string, any> | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["screener", activeFilters],
    queryFn: () => api.screener(activeFilters!),
    enabled: activeFilters !== null,
    staleTime: 60_000,
  });

  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const run = () => {
    const f: Record<string, any> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== "") f[k] = k === "sector" ? v : Number(v);
    }
    setActiveFilters(f);
  };

  const applyPreset = (preset: Partial<Filters>) => {
    const f = { ...EMPTY, ...preset };
    setFilters(f);
    const active: Record<string, any> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v !== "") active[k] = k === "sector" ? v : Number(v);
    }
    setActiveFilters(active);
  };

  const results = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Filter size={24} className="text-crimson-400" /> Stock Screener
        </h1>
        <p className="text-sm text-ink-500">Filter 50+ stocks by technical, fundamental, and momentum criteria</p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.filters)}
            className="rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-xs text-ink-300 transition hover:border-crimson-500/20 hover:bg-white/[0.03]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <BentoCard span="col-span-12" title="Filters">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <FilterInput label="Change % Min" value={filters.change_pct_min} onChange={set("change_pct_min")} placeholder="-5" />
          <FilterInput label="Change % Max" value={filters.change_pct_max} onChange={set("change_pct_max")} placeholder="10" />
          <FilterInput label="RSI Min" value={filters.rsi_min} onChange={set("rsi_min")} placeholder="0" />
          <FilterInput label="RSI Max" value={filters.rsi_max} onChange={set("rsi_max")} placeholder="100" />
          <FilterInput label="Vol Ratio Min" value={filters.volume_ratio_min} onChange={set("volume_ratio_min")} placeholder="1.5" />
          <FilterInput label="P/E Min" value={filters.pe_min} onChange={set("pe_min")} placeholder="0" />
          <FilterInput label="P/E Max" value={filters.pe_max} onChange={set("pe_max")} placeholder="50" />
          <FilterInput label="Mkt Cap Min ($B)" value={filters.market_cap_min} onChange={set("market_cap_min")} placeholder="10" />
          <FilterInput label="Mkt Cap Max ($B)" value={filters.market_cap_max} onChange={set("market_cap_max")} placeholder="3000" />
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-ink-500 mb-1">Sector</label>
            <select
              value={filters.sector}
              onChange={(e) => set("sector")(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-crimson-500/40"
            >
              {SECTORS.map((s) => <option key={s} value={s}>{s || "Any"}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={run}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1 rounded-lg bg-crimson-600 px-4 py-2 text-sm font-medium text-white hover:bg-crimson-500 transition disabled:opacity-50"
          >
            {isLoading || isFetching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Screen
          </button>
          <button
            onClick={() => { setFilters(EMPTY); setActiveFilters(null); }}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-ink-300 hover:bg-white/5 transition"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </BentoCard>

      {/* Results */}
      {activeFilters !== null && !isLoading && !isFetching && (
        <BentoCard span="col-span-12" title={`Results (${results.length} matches)`}>
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">No stocks match your filters. Try loosening the criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-ink-500">
                    <th className="py-2 text-left font-medium">Symbol</th>
                    <th className="py-2 text-left font-medium">Name</th>
                    <th className="py-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Change %</th>
                    <th className="py-2 text-right font-medium">Volume</th>
                    <th className="py-2 text-right font-medium">Vol Ratio</th>
                    {(activeFilters.rsi_min !== undefined || activeFilters.rsi_max !== undefined) && (
                      <th className="py-2 text-right font-medium">RSI</th>
                    )}
                    {(activeFilters.pe_min !== undefined || activeFilters.pe_max !== undefined) && (
                      <th className="py-2 text-right font-medium">P/E</th>
                    )}
                    <th className="py-2 text-right font-medium">Mkt Cap</th>
                    {activeFilters.sector && <th className="py-2 text-left font-medium">Sector</th>}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r: any) => (
                    <tr key={r.symbol} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="py-2">
                        <Link href={`/stock/${r.symbol}`} className="font-mono font-medium text-ink-100 hover:text-crimson-300 transition">
                          {r.symbol}
                        </Link>
                      </td>
                      <td className="py-2 text-ink-300 max-w-[150px] truncate">{r.name ?? "—"}</td>
                      <td className="py-2 text-right font-mono text-ink-100">${r.price?.toFixed(2)}</td>
                      <td className={cn("py-2 text-right font-mono", changeColor(r.change_pct))}>
                        {pct(r.change_pct)}
                      </td>
                      <td className="py-2 text-right font-mono text-ink-300">
                        {r.volume ? (r.volume / 1e6).toFixed(1) + "M" : "—"}
                      </td>
                      <td className={cn("py-2 text-right font-mono", r.volume_ratio > 1.5 ? "text-crimson-400" : "text-ink-300")}>
                        {r.volume_ratio ? r.volume_ratio + "x" : "—"}
                      </td>
                      {(activeFilters.rsi_min !== undefined || activeFilters.rsi_max !== undefined) && (
                        <td className={cn("py-2 text-right font-mono",
                          r.rsi < 30 ? "text-emerald-400" : r.rsi > 70 ? "text-crimson-400" : "text-ink-300"
                        )}>
                          {r.rsi?.toFixed(1) ?? "—"}
                        </td>
                      )}
                      {(activeFilters.pe_min !== undefined || activeFilters.pe_max !== undefined) && (
                        <td className="py-2 text-right font-mono text-ink-300">{r.pe?.toFixed(1) ?? "—"}</td>
                      )}
                      <td className="py-2 text-right font-mono text-ink-300">
                        {r.market_cap ? `$${(r.market_cap / 1e9).toFixed(0)}B` : "—"}
                      </td>
                      {activeFilters.sector && <td className="py-2 text-ink-300 text-xs">{r.sector ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoCard>
      )}

      {activeFilters === null && (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/10">
          <p className="text-sm text-ink-500">Set filters above and click <span className="text-crimson-400">Screen</span>, or pick a preset</p>
        </div>
      )}
    </div>
  );
}
