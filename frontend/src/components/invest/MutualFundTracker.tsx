"use client";
import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

type Holding = { code: number; name: string; units: number; invested: number };
const KEY = "si_mf_holdings";

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const signed = (v: number | null | undefined) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

function useDebounced(v: string, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

/** Track the mutual funds you actually hold, valued at the latest AMFI NAV.
 *  Holdings are kept in this browser; NAVs come from mfapi.in (free, daily). */
export function MutualFundTracker() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ code: number; name: string } | null>(null);
  const [units, setUnits] = useState("");
  const [invested, setInvested] = useState("");
  const term = useDebounced(q.trim());

  useEffect(() => {
    try { setHoldings(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* ignore */ }
  }, []);
  const save = (next: Holding[]) => {
    setHoldings(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const { data: hits = [], isFetching: searching } = useQuery({
    queryKey: ["mf-search", term.toLowerCase()],
    queryFn: () => api.mfSearch(term),
    enabled: term.length >= 3 && !picked,
    staleTime: 24 * 60 * 60_000,
  });

  const schemes = useQueries({
    queries: holdings.map((h) => ({
      queryKey: ["mf", h.code],
      queryFn: () => api.mfScheme(h.code),
      staleTime: 60 * 60_000,
    })),
  });

  const rows = holdings.map((h, i) => {
    const s = schemes[i]?.data;
    const value = s ? h.units * s.nav : null;
    return { h, s, loading: schemes[i]?.isLoading, value, gain: value != null && h.invested ? value - h.invested : null };
  });
  const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const totalInvested = rows.reduce((a, r) => a + (r.value != null ? r.h.invested : 0), 0);

  const add = () => {
    const u = Number(units), inv = Number(invested);
    if (!picked || !(u > 0)) return;
    save([...holdings.filter((h) => h.code !== picked.code), { code: picked.code, name: picked.name, units: u, invested: inv > 0 ? inv : 0 }]);
    setPicked(null); setQ(""); setUnits(""); setInvested("");
  };

  return (
    <div className="space-y-4">
      <BentoCard span="" title="My mutual funds" subtitle="Valued at the latest NAV published by AMFI. Your holdings stay in this browser.">
        {holdings.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-xl bg-white/5 px-4 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Current value</p>
              <p className="font-mono text-xl font-semibold">{inr(total)}</p>
            </div>
            {totalInvested > 0 && (
              <div className="rounded-xl bg-white/5 px-4 py-2">
                <p className="text-[10px] uppercase tracking-wide text-ink-500">Gain on {inr(totalInvested)} invested</p>
                <p className={cn("font-mono text-xl font-semibold", total >= totalInvested ? "text-emerald-400" : "text-red-400")}>
                  {inr(total - totalInvested)} ({signed((total / totalInvested - 1) * 100)})
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {rows.map(({ h, s, loading, value, gain }) => (
            <div key={h.code} className="flex flex-col gap-2 rounded-xl bg-white/[0.03] p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-100" title={h.name}>{h.name}</p>
                <p className="text-[11px] text-ink-500">
                  {h.units} units
                  {s && <> · NAV ₹{s.nav.toFixed(2)} on {new Date(s.nav_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>}
                  {s?.category && <> · {s.category.replace(/^.*?-\s*/, "")}</>}
                </p>
                {s && (
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    Fund returns: 1y {signed(s.returns["1y"])} · 3y {signed(s.returns["3y"])}/yr · 5y {signed(s.returns["5y"])}/yr
                  </p>
                )}
              </div>
              {s?.history?.length > 2 && (
                <div className="h-10 w-28 shrink-0" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={s.history}>
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "none", fontSize: 11 }}
                        formatter={(v: number) => `₹${v.toFixed(2)}`} labelFormatter={() => ""} />
                      <Line dataKey="nav" dot={false} stroke="#10b981" strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex items-center gap-3 sm:w-44 sm:justify-end">
                <div className="text-right">
                  <p className="font-mono text-sm">{loading ? <Loader2 size={13} className="inline animate-spin" /> : value != null ? inr(value) : "-"}</p>
                  {gain != null && <p className={cn("font-mono text-[11px]", gain >= 0 ? "text-emerald-400" : "text-red-400")}>{gain >= 0 ? "+" : ""}{inr(gain)}</p>}
                </div>
                <button onClick={() => save(holdings.filter((x) => x.code !== h.code))} aria-label={`Remove ${h.name}`}
                  className="rounded p-1 text-ink-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!holdings.length && (
            <p className="rounded-xl border border-dashed border-white/10 py-6 text-center text-sm text-ink-500">
              Add a fund you hold below to see what it&apos;s worth today.
            </p>
          )}
        </div>
      </BentoCard>

      <BentoCard span="" title="Add a fund">
        {!picked ? (
          <div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
              <Search size={14} className="text-ink-500" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by fund name, e.g. Parag Parikh Flexi Cap"
                aria-label="Search mutual funds" className="w-full bg-transparent py-2 text-sm outline-none" />
              {searching && <Loader2 size={14} className="animate-spin text-ink-500" />}
            </div>
            {term.length >= 3 && (
              <ul className="mt-2 max-h-64 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.code}>
                    <button onClick={() => setPicked(h)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-300 hover:bg-white/5">
                      {h.name}
                    </button>
                  </li>
                ))}
                {!searching && !hits.length && <li className="px-2 py-2 text-xs text-ink-500">No funds found.</li>}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-ink-500">Pick the exact plan you hold (Direct or Regular, Growth or IDCW): they have different NAVs.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-200">{picked.name}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-ink-400">Units held
                <input type="number" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} min={0}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" />
              </label>
              <label className="block text-xs text-ink-400">Amount invested (optional)
                <input type="number" inputMode="decimal" value={invested} onChange={(e) => setInvested(e.target.value)} min={0}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none" />
              </label>
            </div>
            <p className="text-[11px] text-ink-500">Units are on your account statement (CAS) or your app&apos;s holdings screen.</p>
            <div className="flex gap-2">
              <button onClick={add} disabled={!(Number(units) > 0)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40">
                <Plus size={13} /> Add to my funds
              </button>
              <button onClick={() => setPicked(null)} className="rounded-lg px-3 py-1.5 text-xs text-ink-400 hover:text-ink-200">Cancel</button>
            </div>
          </div>
        )}
      </BentoCard>
    </div>
  );
}
