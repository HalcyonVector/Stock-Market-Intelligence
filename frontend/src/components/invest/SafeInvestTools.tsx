"use client";
/* Extra Safe Invest calculators. All maths runs in the browser (no API calls
 * beyond the instrument list), and saved goals live in this browser's
 * localStorage, so none of this costs any free-tier quota. */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Plus, Trash2, Target, Info } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

export const fmtMoney = (n: number, cur: string) => {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return cur === "₹"
    ? `${sign}₹${a >= 1e7 ? (a / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? (a / 1e5).toFixed(2) + " L" : Math.round(a).toLocaleString("en-IN")}`
    : `${sign}$${a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : Math.round(a).toLocaleString("en-US")}`;
};

/* ── Small shared inputs ─────────────────────────────────────────── */
function NumField({ label, value, onChange, step = 1, min = 0, suffix, hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
  suffix?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-400">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-white/10 bg-white/5 focus-within:border-emerald-500/40">
        <input
          type="number" inputMode="decimal" value={Number.isFinite(value) ? value : 0} step={step} min={min}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        {suffix && <span className="pr-3 text-xs text-ink-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[10px] text-ink-500">{hint}</span>}
    </label>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-400">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-emerald-500/40"
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ── 1. After tax & inflation ────────────────────────────────────── */
// How the return is taxed (India new regime FY2026-27; US federal). Simplified
// on purpose; the page says so.
type TaxKind = "exempt" | "slab" | "equity" | "nps" | "us_interest" | "us_ltcg" | "us_exempt";
const TAX_KIND: Record<string, TaxKind> = {
  ppf: "exempt", ssy: "exempt", epf: "exempt", vpf: "exempt", sgb: "exempt",
  nps: "nps",
  elss: "equity", index_fund: "equity", arbitrage_fund: "equity", multi_asset_fund: "equity",
  municipal_bond: "us_exempt", sp500_etf: "us_ltcg",
  hysa: "us_interest", treasury: "us_interest", money_market: "us_interest", bond_etf: "us_interest",
  cd: "us_interest", brokered_cd: "us_interest", corporate_bond_etf: "us_interest",
  ibond: "us_interest", eebond: "us_interest", tips: "us_interest",
};
const TAX_LABEL: Record<TaxKind, string> = {
  exempt: "Tax-free",
  slab: "Taxed at your slab",
  equity: "12.5% LTCG above ₹1.25L",
  nps: "60% tax-free at exit",
  us_interest: "Taxed as income",
  us_ltcg: "Long-term capital gains",
  us_exempt: "Federal tax-free",
};

function afterTax(kind: TaxKind, ratePct: number, years: number, amount: number, slab: number, usLtcg: number) {
  const r = ratePct / 100;
  const t = slab / 100;
  const grow = (rr: number) => amount * Math.pow(1 + rr, years);
  let fv: number;
  switch (kind) {
    case "exempt":
    case "us_exempt":
      fv = grow(r); break;
    case "slab":
    case "us_interest":
      fv = grow(r * (1 - t)); break;            // interest taxed every year
    case "nps": {
      const gross = grow(r);
      fv = gross - (gross - amount) * 0.4 * t;  // 40% annuity part taxed later; approximation
      break;
    }
    case "equity": {
      const gross = grow(r);
      const gain = gross - amount;
      fv = gross - (years >= 1 ? Math.max(0, gain - 125000) * 0.125 : gain * 0.2);
      break;
    }
    case "us_ltcg": {
      const gross = grow(r);
      fv = gross - (gross - amount) * (years >= 1 ? usLtcg : t);
      break;
    }
  }
  const annual = years > 0 ? Math.pow(fv / amount, 1 / years) - 1 : 0;
  return { fv, annual: annual * 100 };
}

export function RealReturnsTab({ country, cur }: { country: "IN" | "US"; cur: string }) {
  const { data } = useQuery({ queryKey: ["instruments", country], queryFn: () => api.instruments(country) });
  const india = country === "IN";
  const [amount, setAmount] = useState(india ? 100000 : 10000);
  const [years, setYears] = useState(5);
  const [slab, setSlab] = useState(india ? 10 : 12);
  const [inflation, setInflation] = useState(india ? 5 : 3);
  useEffect(() => {
    setAmount(india ? 100000 : 10000); setSlab(india ? 10 : 12); setInflation(india ? 5 : 3);
  }, [india]);

  const usLtcg = slab <= 12 ? 0 : slab >= 35 ? 0.2 : 0.15;
  const rows = useMemo(() => {
    const list: any[] = data?.instruments ?? [];
    return list
      .filter((i) => typeof i.current_rate === "number" && i.current_rate > 0)
      .map((i) => {
        const kind: TaxKind = TAX_KIND[i.id] ?? (india ? "slab" : "us_interest");
        const { fv, annual } = afterTax(kind, i.current_rate, years, amount, slab, usLtcg);
        const real = ((1 + annual / 100) / (1 + inflation / 100) - 1) * 100;
        const todays = fv / Math.pow(1 + inflation / 100, years);
        return { id: i.id, name: i.name, rate: i.current_rate, kind, annual, real, fv, todays, risk: i.risk };
      })
      .sort((a, b) => b.real - a.real);
  }, [data, years, amount, slab, inflation, india, usLtcg]);

  const slabs = india
    ? [0, 5, 10, 15, 20, 30].map((v) => ({ value: v, label: `${v}%${v === 0 ? " (income under ₹12.75L)" : ""}` }))
    : [10, 12, 22, 24, 32, 35, 37].map((v) => ({ value: v, label: `${v}% federal bracket` }));

  return (
    <div className="space-y-4">
      <BentoCard span="" title="What you actually keep" subtitle="After tax, and in today's money after inflation">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="Amount invested" value={amount} onChange={setAmount} step={india ? 10000 : 1000} suffix={cur} />
          <NumField label="Years" value={years} onChange={(v) => setYears(Math.min(40, Math.max(1, v)))} min={1} />
          <Select label={india ? "Your tax slab (new regime)" : "Your tax bracket"} value={slab} options={slabs} onChange={setSlab} />
          <NumField label="Inflation" value={inflation} onChange={setInflation} step={0.5} suffix="% / yr"
            hint={india ? "India's CPI has averaged ~5% over the last decade" : "US CPI long-run average is ~3%"} />
        </div>
      </BentoCard>

      <BentoCard span="" title={`${fmtMoney(amount, cur)} for ${years} year${years > 1 ? "s" : ""}`} subtitle="Sorted by real (after-inflation) return">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th className="px-2 py-2 font-medium">Instrument</th>
                <th className="px-2 py-2 text-right font-medium">Rate</th>
                <th className="px-2 py-2 text-right font-medium">After tax</th>
                <th className="px-2 py-2 text-right font-medium">After inflation</th>
                <th className="px-2 py-2 text-right font-medium">You get</th>
                <th className="px-2 py-2 text-right font-medium">In today&apos;s money</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-2 py-2">
                    <div className="font-medium text-ink-200">{r.name}</div>
                    <div className="text-[10px] text-ink-500">{TAX_LABEL[r.kind as TaxKind]}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-300">{r.rate.toFixed(2)}%</td>
                  <td className="px-2 py-2 text-right tabular-nums text-ink-200">{r.annual.toFixed(2)}%</td>
                  <td className={cn("px-2 py-2 text-right font-semibold tabular-nums", r.real >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {r.real >= 0 ? "+" : ""}{r.real.toFixed(2)}%
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ink-200">{fmtMoney(r.fv, cur)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ink-400">{fmtMoney(r.todays, cur)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="px-2 py-8 text-center text-xs text-ink-500">Loading instruments…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex gap-2 text-[11px] text-ink-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          Simplified: interest is taxed each year at your rate; equity funds pay 12.5% on gains above ₹1.25 lakh
          when sold after a year ({india ? "20% before" : "US: 0/15/20% by bracket"}). Market-linked rates are
          estimates, not guarantees. Surcharge, cess and old-regime deductions are ignored.
        </p>
      </BentoCard>
    </div>
  );
}

/* ── 2. FD / CD ladder ───────────────────────────────────────────── */
export function LadderTab({ country, cur }: { country: "IN" | "US"; cur: string }) {
  const india = country === "IN";
  const [total, setTotal] = useState(india ? 500000 : 25000);
  const [rungs, setRungs] = useState(5);
  const [rates, setRates] = useState<number[]>(india ? [6.6, 6.8, 7.0, 7.0, 6.75] : [4.3, 4.1, 4.0, 3.9, 3.9]);
  useEffect(() => {
    setTotal(india ? 500000 : 25000);
    setRates(india ? [6.6, 6.8, 7.0, 7.0, 6.75] : [4.3, 4.1, 4.0, 3.9, 3.9]);
  }, [india]);

  const each = total / rungs;
  const rows = Array.from({ length: rungs }, (_, i) => {
    const yrs = i + 1;
    const rate = rates[i] ?? rates[rates.length - 1];
    // Quarterly compounding, as most Indian bank FDs and many US CDs do.
    const value = each * Math.pow(1 + rate / 400, yrs * 4);
    return { yrs, rate, value };
  });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const deposit = india ? "FD" : "CD";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <BentoCard span="" title={`${deposit} ladder`} subtitle="Split one deposit into several with staggered maturities">
        <div className="space-y-3">
          <NumField label="Total to invest" value={total} onChange={setTotal} step={india ? 10000 : 1000} suffix={cur} />
          <Select label="Number of rungs" value={rungs} onChange={setRungs}
            options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n} (maturing every year for ${n} years)` }))} />
          <div className="grid grid-cols-2 gap-2">
            {rows.map((r, i) => (
              <NumField key={i} label={`${r.yrs}-year rate`} value={rates[i]} step={0.05} suffix="%"
                onChange={(v) => setRates((prev) => prev.map((x, j) => (j === i ? v : x)))} />
            ))}
          </div>
          <p className="text-[10px] text-ink-500">Defaults are typical {india ? "large-bank" : "online-bank"} rates; check your bank&apos;s current card.</p>
        </div>
      </BentoCard>
      <BentoCard span="" title="Your ladder" className="lg:col-span-2">
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.yrs} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-300">
                {r.yrs}y
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-200">{fmtMoney(each, cur)} in a {r.yrs}-year {deposit} at {r.rate}%</p>
                <div className="mt-1 h-1.5 rounded-full bg-white/5">
                  <div className="h-1.5 rounded-full bg-emerald-500/60" style={{ width: `${(r.yrs / rungs) * 100}%` }} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-emerald-400">{fmtMoney(r.value, cur)}</p>
                <p className="text-[10px] text-ink-500">at maturity</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-sm">
          <span className="text-ink-400">Total if each rung is held to maturity</span>
          <span className="font-semibold text-ink-100">{fmtMoney(totalValue, cur)}</span>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Why ladder: some money becomes available every year without breaking a deposit (no penalty), and when a
          rung matures you re-invest it as a new {rungs}-year {deposit}, so you keep catching the longer-term
          rate. If rates rise, only part of your money was locked at the old rate.
        </p>
      </BentoCard>
    </div>
  );
}

/* ── 3. SIP vs lump sum ──────────────────────────────────────────── */
export function SipVsLumpSum({ cur }: { cur: string }) {
  const [amount, setAmount] = useState(cur === "₹" ? 120000 : 12000);
  const [rate, setRate] = useState(10);
  const [years, setYears] = useState(5);
  const [spread, setSpread] = useState(12);
  const [park, setPark] = useState(cur === "₹" ? 3 : 4);

  const { series, lump, sip } = useMemo(() => {
    const mr = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const pr = Math.pow(1 + park / 100, 1 / 12) - 1;
    const months = years * 12;
    const n = Math.min(spread, months);
    const inst = amount / n;
    let L = amount, invested = 0, parked = amount;
    const out: { month: number; lump: number; sip: number }[] = [{ month: 0, lump: amount, sip: amount }];
    for (let m = 1; m <= months; m++) {
      L *= 1 + mr;
      if (m <= n) { parked -= inst; invested += inst; }
      invested *= 1 + mr;
      parked = parked > 1e-6 ? parked * (1 + pr) : 0;
      if (m % 3 === 0 || m === months) out.push({ month: m, lump: Math.round(L), sip: Math.round(invested + parked) });
    }
    return { series: out, lump: L, sip: invested + parked };
  }, [amount, rate, years, spread, park]);

  const diff = lump - sip;
  return (
    <BentoCard span="" title="Got a lump sum? Invest it all now, or spread it out?"
      subtitle="Same money either way; the spread-out part waits in a savings account">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3">
          <NumField label="Amount you have" value={amount} onChange={setAmount} step={cur === "₹" ? 10000 : 1000} suffix={cur} />
          <NumField label="Expected return" value={rate} onChange={setRate} step={0.5} suffix="% / yr" />
          <NumField label="Years" value={years} onChange={(v) => setYears(Math.min(40, Math.max(1, v)))} min={1} />
          <NumField label="Spread over" value={spread} onChange={(v) => setSpread(Math.min(60, Math.max(1, v)))} min={1} suffix="months" />
          <NumField label="Savings rate while waiting" value={park} onChange={setPark} step={0.5} suffix="% / yr" />
        </div>
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(m) => `${Math.round(m / 12 * 10) / 10}y`} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmtMoney(v, cur)} width={72} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                formatter={(v: number) => fmtMoney(v, cur)} labelFormatter={(m) => `Month ${m}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="lump" name="All now" stroke="#10b981" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="sip" name={`Spread over ${spread} mo`} stroke="#60a5fa" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2"><p className="text-[10px] text-ink-500">All now</p><p className="font-semibold text-emerald-400">{fmtMoney(lump, cur)}</p></div>
            <div className="rounded-xl bg-white/5 p-2"><p className="text-[10px] text-ink-500">Spread out</p><p className="font-semibold text-blue-400">{fmtMoney(sip, cur)}</p></div>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            With a steady {rate}% return, investing at once ends {fmtMoney(Math.abs(diff), cur)} {diff >= 0 ? "ahead" : "behind"}.
            Real markets don&apos;t rise in a straight line, though: spreading out costs a little on average but
            protects you from putting everything in right before a fall. If a drop would make you panic-sell,
            spreading out is the calmer choice.
          </p>
        </div>
      </div>
    </BentoCard>
  );
}

/* ── 4. Saved goals (this browser only) ──────────────────────────── */
type Goal = { id: string; name: string; target: number; saved: number; deadline: string; rate: number; cur: string };
const GOALS_KEY = "si_goals";

function loadGoals(): Goal[] {
  try { return JSON.parse(window.localStorage.getItem(GOALS_KEY) || "[]"); } catch { return []; }
}

function monthsUntil(deadline: string): number {
  const [y, m] = deadline.split("-").map(Number);
  const now = new Date();
  return Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()));
}

/** Monthly amount needed to reach `target` from `saved` in `months` at `rate`%/yr. */
export function requiredMonthly(target: number, saved: number, months: number, rate: number) {
  const r = rate / 100 / 12;
  const fvSaved = saved * Math.pow(1 + r, months);
  const gap = target - fvSaved;
  if (gap <= 0) return 0;
  if (r === 0) return gap / months;
  return gap / (((Math.pow(1 + r, months) - 1) / r) * (1 + r));
}

export function SavedGoals({ cur }: { cur: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [draft, setDraft] = useState({ name: "", target: 0, saved: 0, deadline: "", rate: 7 });
  const [expenses, setExpenses] = useState(cur === "₹" ? 20000 : 2000);

  useEffect(() => { setGoals(loadGoals()); }, []);
  const save = (next: Goal[]) => {
    setGoals(next);
    try { window.localStorage.setItem(GOALS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const defaultDeadline = () => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const add = (g: Omit<Goal, "id" | "cur">) => {
    if (!g.name.trim() || g.target <= 0) return;
    save([...goals, { ...g, id: Math.random().toString(36).slice(2, 10), cur }]);
    setDraft({ name: "", target: 0, saved: 0, deadline: "", rate: 7 });
  };
  const mine = goals.filter((g) => g.cur === cur);

  return (
    <BentoCard span="" title="My goals" subtitle="Saved in this browser only — nothing is uploaded">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs font-medium text-emerald-300">Start with an emergency fund</p>
            <p className="mt-1 text-[11px] text-ink-400">Most guides suggest 6 months of expenses, kept somewhere you can withdraw any day.</p>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1"><NumField label="Monthly expenses" value={expenses} onChange={setExpenses} suffix={cur} /></div>
              <button
                onClick={() => add({ name: "Emergency fund", target: expenses * 6, saved: 0, deadline: defaultDeadline(), rate: 6.5 })}
                className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
              >
                Add {fmtMoney(expenses * 6, cur)}
              </button>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-white/10 p-3">
            <label className="block">
              <span className="text-xs text-ink-400">Goal name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 40) })}
                placeholder="New laptop, trip, bike…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-emerald-500/40" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Target" value={draft.target} onChange={(v) => setDraft({ ...draft, target: v })} suffix={cur} />
              <NumField label="Already saved" value={draft.saved} onChange={(v) => setDraft({ ...draft, saved: v })} suffix={cur} />
              <label className="block">
                <span className="text-xs text-ink-400">By (month)</span>
                <input type="month" value={draft.deadline || defaultDeadline()}
                  onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
              </label>
              <NumField label="Expected return" value={draft.rate} onChange={(v) => setDraft({ ...draft, rate: v })} step={0.5} suffix="%" />
            </div>
            <button
              onClick={() => add({ ...draft, deadline: draft.deadline || defaultDeadline() })}
              disabled={!draft.name.trim() || draft.target <= 0}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-sm font-medium text-ink-100 hover:bg-white/15 disabled:opacity-40"
            >
              <Plus size={14} /> Save goal
            </button>
          </div>
        </div>

        <div className="space-y-2 lg:col-span-3">
          {!mine.length && (
            <div className="grid h-full min-h-[160px] place-items-center rounded-xl border border-dashed border-white/10 p-6 text-center">
              <div>
                <Target size={22} className="mx-auto text-ink-500" />
                <p className="mt-2 text-sm text-ink-400">No goals yet</p>
                <p className="text-xs text-ink-500">Add one on the left and track how much to put away each month.</p>
              </div>
            </div>
          )}
          {mine.map((g) => {
            const months = monthsUntil(g.deadline);
            const need = requiredMonthly(g.target, g.saved, months, g.rate);
            const pct = Math.min(100, (g.saved / g.target) * 100);
            return (
              <div key={g.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-100">{g.name}</p>
                    <p className="text-[11px] text-ink-500">
                      {fmtMoney(g.saved, cur)} of {fmtMoney(g.target, cur)} · {months} months left
                    </p>
                  </div>
                  <button onClick={() => save(goals.filter((x) => x.id !== g.id))}
                    aria-label={`Delete goal ${g.name}`} className="rounded p-1 text-ink-500 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/5">
                  <div className="h-2 rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-300">
                    {need > 0
                      ? <>Put away <span className="font-semibold text-emerald-400">{fmtMoney(need, cur)}/month</span> at {g.rate}%</>
                      : <span className="font-semibold text-emerald-400">On track — target reached</span>}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-ink-500">Saved:</span>
                    <input
                      type="number" value={g.saved} min={0} aria-label={`Amount saved for ${g.name}`}
                      onChange={(e) => save(goals.map((x) => x.id === g.id ? { ...x, saved: Math.max(0, Number(e.target.value) || 0) } : x))}
                      className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BentoCard>
  );
}

/** Banner on the instruments tab: says when the official rates expire, and
 *  warns once they're past that date. */
export function RatesNotice({ asOf, validUntil }: { asOf?: string; validUntil?: string }) {
  if (!asOf || !validUntil) return null;
  const stale = new Date() > new Date(`${validUntil}T23:59:59+05:30`);
  const until = new Date(`${validUntil}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
      stale ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/5 text-ink-400",
    )}>
      <Info size={14} className="mt-0.5 shrink-0" />
      {stale
        ? <span>Government small-savings rates shown are for {asOf} and may have changed since {until}. Check the latest quarter&apos;s rates on the India Post or your bank&apos;s site before investing.</span>
        : <span>Government small-savings rates are official for {asOf} (valid until {until}). Bank and fund rates are market estimates.</span>}
    </div>
  );
}
