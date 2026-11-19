"use client";
import { useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { FileUp, FlaskConical, Loader2, ListPlus } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";
import { flowsFor, parseFundTxns, summarise, xirr, type FundTxn } from "@/lib/fundTxns";

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (r: number | null) => (r == null ? "n/a" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(2)}%`);

// Sample: a ₹5,000 monthly SIP into two real funds for three years, priced at
// each month's last published NAV, with one partial redemption.
const SAMPLE_FUNDS = [
  { code: 122639, name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" },
  { code: 120716, name: "UTI Nifty 50 Index Fund - Direct Plan - Growth" },
];

async function buildSample(): Promise<FundTxn[]> {
  const out: FundTxn[] = [];
  for (const f of SAMPLE_FUNDS) {
    const s = await api.mfScheme(f.code);
    const hist: { date: string; nav: number }[] = (s?.history ?? []).slice(-37, -1);
    let units = 0;
    hist.forEach((p, i) => {
      const u = +(5000 / p.nav).toFixed(3);
      units += u;
      out.push({ date: p.date, scheme: f.name, code: f.code, amount: 5000, units: u, kind: "buy" });
      if (f.code === 122639 && i === 24) {
        const sold = +(units * 0.25).toFixed(3);
        units -= sold;
        out.push({ date: p.date, scheme: f.name, code: f.code, amount: +(sold * p.nav).toFixed(2), units: sold, kind: "sell" });
      }
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Import fund transactions (a CSV from a fund app), value them at today's
 *  AMFI NAV and work out XIRR, the return that accounts for when each
 *  instalment went in. Nothing leaves the browser except fund lookups. */
export function FundTransactions() {
  const [txns, setTxns] = useState<FundTxn[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [source, setSource] = useState<"file" | "sample" | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const funds = summarise(txns);
  // Each fund needs an AMFI code to look up its NAV: use the file's code, or
  // search by the scheme name and take the closest match.
  const lookups = useQueries({
    queries: funds.map((f) => ({
      queryKey: ["mf-resolve", f.code ?? f.scheme.toLowerCase()],
      queryFn: async () => {
        let code = f.code;
        if (!code) {
          const hits = await api.mfSearch(f.scheme.replace(/[^\w\s&-]/g, " ").slice(0, 60));
          code = (hits.find((h) => h.name.toLowerCase() === f.scheme.toLowerCase()) ?? hits[0])?.code;
        }
        return code ? await api.mfScheme(code) : null;
      },
      staleTime: 60 * 60_000,
    })),
  });

  const rows = funds.map((f, i) => {
    const s = lookups[i]?.data;
    const value = s ? f.units * s.nav : null;
    const own = txns.filter((t) => (t.code ? `#${t.code}` : t.scheme.toLowerCase()) === f.key);
    return { f, s, loading: lookups[i]?.isLoading, value, xirr: s && value != null ? xirr(flowsFor(own, value, s.nav_date)) : null };
  });
  const ready = rows.length > 0 && rows.every((r) => !r.loading);
  const priced = rows.filter((r) => r.value != null && r.s);
  const valueNow = priced.reduce((a, r) => a + (r.value ?? 0), 0);
  const invested = funds.reduce((a, f) => a + f.invested, 0);
  const redeemed = funds.reduce((a, f) => a + f.redeemed, 0);
  const latest = priced.reduce((m, r) => (r.s.nav_date > m ? r.s.nav_date : m), "");
  const pricedTxns = txns.filter((t) => priced.some((r) => r.f.key === (t.code ? `#${t.code}` : t.scheme.toLowerCase())));
  const total = ready && priced.length ? xirr(flowsFor(pricedTxns, valueNow, latest)) : null;

  const load = (list: FundTxn[], warn: string[], from: "file" | "sample") => {
    setTxns(list); setWarnings(warn); setSource(from); setSaved(false);
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    const p = parseFundTxns(await file.text());
    load(p.txns, p.warnings, "file");
  };
  const onSample = async () => {
    setBusy(true);
    try { load(await buildSample(), [], "sample"); }
    catch { load([], ["Couldn't fetch the sample funds' NAVs. Try again in a moment."], "sample"); }
    finally { setBusy(false); }
  };
  const track = () => {
    const list = rows.filter((r) => r.s && r.f.units > 0)
      .map((r) => ({ code: r.s.code, name: r.s.name, units: r.f.units, invested: r.f.costHeld }));
    try {
      const prev = JSON.parse(localStorage.getItem("si_mf_holdings") || "[]") as { code: number }[];
      const codes = new Set(list.map((h) => h.code));
      localStorage.setItem("si_mf_holdings", JSON.stringify([...prev.filter((h) => !codes.has(h.code)), ...list]));
      window.dispatchEvent(new Event("si-mf-updated"));
      setSaved(true);
    } catch { /* private mode */ }
  };

  return (
    <BentoCard span="" title="Import transactions and see your XIRR"
      subtitle="XIRR is the yearly return that counts when each SIP instalment went in. The file is read in this browser and not uploaded.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Transaction file"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-crimson-600 px-3 py-2 text-xs font-medium text-white hover:bg-crimson-500">
          <FileUp size={14} /> Choose a CSV file
        </button>
        <button onClick={onSample} disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-ink-200 hover:bg-white/5 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Try sample data
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        Columns needed: <span className="text-ink-300">Date, Scheme name (or AMFI code), Amount, Units</span>, and a Type column marking
        Purchase, SIP or Redemption. Most fund apps let you export this from their transactions or reports screen.
      </p>

      {warnings.map((w) => (
        <p key={w} className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{w}</p>
      ))}

      {funds.length > 0 && (
        <div className="mt-4 space-y-3">
          {source === "sample" && (
            <p className="text-[11px] text-sky-300">
              Sample: ₹5,000 a month into two real funds for three years at each month&apos;s actual NAV, with a quarter of one fund sold a year ago.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Put in" value={inr(invested)} />
            <Tile label="Taken out" value={inr(redeemed)} />
            <Tile label="Worth now" value={ready ? inr(valueNow) : "..."} />
            <Tile label="XIRR" value={ready ? pct(total) : "..."} accent={total != null ? (total >= 0 ? "up" : "down") : undefined} />
          </div>
          <div className="space-y-1.5">
            {rows.map(({ f, s, loading, value, xirr: x }) => (
              <div key={f.key} className="flex flex-col gap-1 rounded-xl bg-white/[0.03] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-100" title={s?.name ?? f.scheme}>{s?.name ?? f.scheme}</p>
                  <p className="text-[11px] text-ink-500">
                    {f.txns} transactions since {new Date(f.firstDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · {f.units} units
                    {!loading && !s && <span className="text-amber-300"> · fund not found, so not valued</span>}
                  </p>
                </div>
                <div className="flex gap-4 font-mono text-xs sm:justify-end">
                  <span>{loading ? <Loader2 size={12} className="inline animate-spin" /> : value != null ? inr(value) : "-"}</span>
                  <span className={cn("w-20 text-right", x == null ? "text-ink-500" : x >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {loading ? "" : pct(x)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={track} disabled={!ready || !priced.length || saved}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40">
              <ListPlus size={13} /> {saved ? "Added to My mutual funds" : "Track these in My mutual funds"}
            </button>
            <p className="flex-1 text-[11px] text-ink-500">
              Valued at the latest AMFI NAV. XIRR assumes everything held is worth that today; it ignores exit loads and tax.
            </p>
          </div>
        </div>
      )}
    </BentoCard>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn("font-mono text-lg font-semibold", accent === "up" ? "text-emerald-400" : accent === "down" ? "text-red-400" : "text-ink-100")}>{value}</p>
    </div>
  );
}
