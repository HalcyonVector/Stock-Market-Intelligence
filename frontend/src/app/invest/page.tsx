"use client";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Calculator, Target, Bot, TrendingUp, Landmark, Wallet, Sliders,
  ChevronRight, Send, Loader2, Info, ExternalLink, IndianRupee, DollarSign,
  ArrowRight, CheckCircle2, AlertTriangle, Lock, Zap, Plus, X, PieChart as PieIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Helpers ─────────────────────────────────────────────────────── */
const fmt = (n: number, cur: string) =>
  cur === "₹"
    ? `₹${n >= 1e7 ? (n / 1e7).toFixed(2) + " Cr" : n >= 1e5 ? (n / 1e5).toFixed(2) + " L" : n.toLocaleString("en-IN")}`
    : `$${n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n.toLocaleString("en-US")}`;

const RISK_COLORS: Record<string, string> = {
  zero: "text-emerald-400",
  very_low: "text-green-400",
  low: "text-lime-400",
  low_to_medium: "text-yellow-400",
  medium: "text-orange-400",
};
const RISK_BG: Record<string, string> = {
  zero: "bg-emerald-500/10 border-emerald-500/20",
  very_low: "bg-green-500/10 border-green-500/20",
  low: "bg-lime-500/10 border-lime-500/20",
  low_to_medium: "bg-yellow-500/10 border-yellow-500/20",
  medium: "bg-orange-500/10 border-orange-500/20",
};
const RISK_LABELS: Record<string, string> = {
  zero: "Zero Risk",
  very_low: "Very Low",
  low: "Low Risk",
  low_to_medium: "Low-Med",
  medium: "Medium",
};

const TABS = [
  { id: "instruments", label: "Where to Invest", icon: Landmark },
  { id: "allocate", label: "Allocation Builder", icon: Sliders },
  { id: "sip", label: "SIP Calculator", icon: Calculator },
  { id: "goal", label: "Goal Planner", icon: Target },
  { id: "advisor", label: "AI Advisor", icon: Bot },
] as const;

type Tab = (typeof TABS)[number]["id"];

const QUICK_QUESTIONS = [
  "I'm a student with ₹1000/month. Where should I start?",
  "What's the safest way for my mom to invest ₹5000/month?",
  "PPF vs FD — which is better for 5 years?",
  "How to save tax under 80C with investments?",
  "I want to build an emergency fund. What's the best option?",
  "Should I invest in gold or debt mutual funds?",
];

/* ── Page ─────────────────────────────────────────────────────────── */
export default function SafeInvestPage() {
  const [tab, setTab] = useState<Tab>("instruments");
  const [country, setCountry] = useState<"IN" | "US">("IN");
  const cur = country === "IN" ? "₹" : "$";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Shield size={22} />
            </span>
            Safe Investment Guide
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Zero-loss instruments, SIP planning, and AI-powered advice for beginners
          </p>
        </div>
        {/* Country toggle */}
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          {(["IN", "US"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                country === c
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-ink-400 hover:text-ink-200"
              )}
            >
              {c === "IN" ? <IndianRupee size={14} /> : <DollarSign size={14} />}
              {c === "IN" ? "India" : "US"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition",
              tab === id
                ? "bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                : "bg-white/5 text-ink-400 hover:bg-white/8 hover:text-ink-200"
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "instruments" && <InstrumentsTab country={country} cur={cur} />}
          {tab === "allocate" && <AllocationTab country={country} cur={cur} />}
          {tab === "sip" && <SIPTab cur={cur} />}
          {tab === "goal" && <GoalTab cur={cur} />}
          {tab === "advisor" && <AdvisorTab country={country} cur={cur} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── Instruments Tab ─────────────────────────────────────────────── */
function InstrumentsTab({ country, cur }: { country: string; cur: string }) {
  const { data } = useQuery({
    queryKey: ["instruments", country],
    queryFn: () => api.instruments(country),
  });
  const [selectedRisk, setSelectedRisk] = useState<string | null>(null);

  const instruments = data?.instruments ?? [];
  const filtered = selectedRisk
    ? instruments.filter((i: any) => i.risk === selectedRisk)
    : instruments;

  const riskLevels = [...new Set(instruments.map((i: any) => i.risk))] as string[];

  return (
    <div className="space-y-4">
      {/* Risk filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedRisk(null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition border",
            !selectedRisk ? "bg-white/10 border-white/20 text-white" : "border-white/5 text-ink-400 hover:text-ink-200"
          )}
        >
          All
        </button>
        {riskLevels.map((r) => (
          <button
            key={r}
            onClick={() => setSelectedRisk(r === selectedRisk ? null : r)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition border",
              selectedRisk === r ? RISK_BG[r] : "border-white/5 text-ink-400 hover:text-ink-200",
              selectedRisk === r && RISK_COLORS[r]
            )}
          >
            {r === "zero" && <Lock className="inline mr-1" size={10} />}
            {RISK_LABELS[r] || r}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((inst: any) => (
          <InstrumentCard key={inst.id} inst={inst} cur={cur} />
        ))}
      </div>

      {/* Zero-loss banner */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-emerald-300">Understanding &ldquo;Zero Risk&rdquo;</p>
          <p className="mt-1 text-xs text-ink-400">
            Instruments marked as &ldquo;Zero Risk&rdquo; are backed by government guarantee or DICGC/FDIC insurance.
            Your principal is protected. However, returns may not beat inflation in all periods.
            &ldquo;Very Low&rdquo; risk means extremely rare chance of minor fluctuation — but historically no losses over 3+ months.
          </p>
        </div>
      </div>
    </div>
  );
}

function InstrumentCard({ inst, cur }: { inst: any; cur: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border p-4 transition cursor-pointer",
        RISK_BG[inst.risk] || "bg-white/5 border-white/10"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-semibold uppercase", RISK_COLORS[inst.risk])}>
              {inst.risk === "zero" && <Lock className="inline mr-1" size={10} />}
              {RISK_LABELS[inst.risk]}
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-500 uppercase">
              {inst.category}
            </span>
          </div>
          <h3 className="mt-1 text-sm font-semibold text-ink-100">{inst.name}</h3>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-400">{inst.current_rate}%</p>
          <p className="text-[10px] text-ink-500">current rate</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/20 px-2 py-1.5">
          <p className="text-[10px] text-ink-500">Return Range</p>
          <p className="text-xs font-medium text-ink-200">
            {inst.return_range[0]}–{inst.return_range[1]}%
          </p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-1.5">
          <p className="text-[10px] text-ink-500">Min</p>
          <p className="text-xs font-medium text-ink-200">{cur}{inst.min_investment}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-1.5">
          <p className="text-[10px] text-ink-500">Liquidity</p>
          <p className="text-xs font-medium text-ink-200 capitalize">{inst.liquidity?.replace("_", " ")}</p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
              <Detail label="Lock-in" value={inst.lock_in} />
              <Detail label="Ideal For" value={inst.ideal_for} />
              <Detail label="Tax Benefits" value={inst.tax_benefit} />
              <Detail label="Guarantee" value={inst.guarantee} />
              <Detail label="Compounding" value={inst.compounding} />
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
                <ExternalLink size={12} className="text-emerald-400" />
                <p className="text-xs text-emerald-300">{inst.where_to_invest}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-2 text-[10px] text-ink-500 text-center">
        {expanded ? "Click to collapse" : "Click for details"}
      </p>
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-ink-500 uppercase">{label}</span>
      <p className="text-xs text-ink-300">{value}</p>
    </div>
  );
}

/* ─── Allocation Builder Tab ──────────────────────────────────────── */
function AllocationTab({ country, cur }: { country: string; cur: string }) {
  const { data: instData } = useQuery({
    queryKey: ["instruments", country],
    queryFn: () => api.instruments(country),
  });

  const instruments = instData?.instruments ?? [];
  const [totalMonthly, setTotalMonthly] = useState(1000);
  const [years, setYears] = useState(10);
  const [allocs, setAllocs] = useState<Array<{ instrument_id: string; pct: number }>>([
    { instrument_id: "ppf", pct: 40 },
    { instrument_id: "rd", pct: 30 },
    { instrument_id: "liquid_fund", pct: 30 },
  ]);

  const totalPct = allocs.reduce((s, a) => s + a.pct, 0);

  const { data: result, isFetching } = useQuery({
    queryKey: ["allocate", totalMonthly, years, allocs, country],
    queryFn: () => api.investAllocate(totalMonthly, allocs, years, country),
    enabled: totalPct === 100 && allocs.length > 0,
    staleTime: Infinity,
  });

  const addInstrument = () => {
    const used = new Set(allocs.map((a) => a.instrument_id));
    const next = instruments.find((i: any) => !used.has(i.id));
    if (next) setAllocs([...allocs, { instrument_id: next.id, pct: 0 }]);
  };

  const removeInstrument = (idx: number) => {
    setAllocs(allocs.filter((_, i) => i !== idx));
  };

  const updatePct = (idx: number, pct: number) => {
    setAllocs(allocs.map((a, i) => (i === idx ? { ...a, pct } : a)));
  };

  const updateInstrument = (idx: number, id: string) => {
    setAllocs(allocs.map((a, i) => (i === idx ? { ...a, instrument_id: id } : a)));
  };

  const PRESETS = [
    { label: "100% Safe", allocs: [{ instrument_id: "ppf", pct: 50 }, { instrument_id: "rd", pct: 30 }, { instrument_id: "nsc", pct: 20 }] },
    { label: "90-10 Split", allocs: [{ instrument_id: "fd", pct: 50 }, { instrument_id: "ppf", pct: 40 }, { instrument_id: "liquid_fund", pct: 10 }] },
    { label: "70-30 Growth", allocs: [{ instrument_id: "ppf", pct: 30 }, { instrument_id: "nsc", pct: 20 }, { instrument_id: "kvp", pct: 20 }, { instrument_id: "debt_fund", pct: 15 }, { instrument_id: "index_fund", pct: 15 }] },
    { label: "Tax Saver", allocs: [{ instrument_id: "ppf", pct: 40 }, { instrument_id: "elss", pct: 30 }, { instrument_id: "nsc", pct: 30 }] },
  ];

  const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setAllocs(p.allocs)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:bg-white/10"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left: allocation inputs */}
        <div className="lg:col-span-2 space-y-4">
          <BentoCard title="Monthly Budget & Duration">
            <div className="space-y-3">
              <SliderInput label="Total Monthly" value={totalMonthly} min={100} max={100000} step={100}
                onChange={setTotalMonthly} format={(v) => `${cur}${v.toLocaleString()}`} />
              <SliderInput label="Duration" value={years} min={1} max={30} step={1}
                onChange={setYears} format={(v) => `${v} years`} />
            </div>
          </BentoCard>

          <BentoCard title="Split Your Investment">
            <div className="space-y-3">
              {allocs.map((alloc, idx) => {
                const inst = instruments.find((i: any) => i.id === alloc.instrument_id);
                return (
                  <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={alloc.instrument_id}
                        onChange={(e) => updateInstrument(idx, e.target.value)}
                        className="flex-1 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-ink-200 outline-none"
                      >
                        {instruments.map((i: any) => (
                          <option key={i.id} value={i.id}>{i.name} ({i.current_rate}%)</option>
                        ))}
                      </select>
                      <button onClick={() => removeInstrument(idx)} className="text-ink-500 hover:text-red-400 transition">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={100} step={5} value={alloc.pct}
                        onChange={(e) => updatePct(idx, Number(e.target.value))}
                        className="flex-1 accent-emerald-500 h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400"
                      />
                      <span className="w-14 text-right text-sm font-semibold text-emerald-400">{alloc.pct}%</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-ink-500">
                      <span>{cur}{Math.round(totalMonthly * alloc.pct / 100)}/mo</span>
                      {inst && (
                        <span className={RISK_COLORS[inst.risk]}>
                          {inst.risk === "zero" && "🔒 "}{RISK_LABELS[inst.risk]} • {inst.current_rate}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addInstrument}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-400 transition hover:bg-white/10 hover:text-ink-200"
              >
                <Plus size={14} /> Add Instrument
              </button>

              {/* Total indicator */}
              <div className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium border",
                totalPct === 100
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-red-500/10 border-red-500/20 text-red-300"
              )}>
                <span>Total Allocation</span>
                <span>{totalPct}% {totalPct === 100 ? "✓" : `(need ${100 - totalPct}% more)`}</span>
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-3 space-y-4">
          {result ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniCard label="Final Value" value={fmt(result.total_value, cur)} accent="emerald" />
                <MiniCard label="Total Invested" value={fmt(result.total_invested, cur)} accent="blue" />
                <MiniCard label="Total Gains" value={fmt(result.total_gains, cur)} accent="green" />
                <MiniCard label="Blended Rate" value={`${result.weighted_rate}%`} accent="amber" />
              </div>

              {/* Risk + guarantee strip */}
              <div className="flex gap-3">
                <div className={cn("flex-1 rounded-xl border p-3 text-center", RISK_BG[result.max_risk])}>
                  <p className="text-[10px] text-ink-500">Portfolio Risk</p>
                  <p className={cn("text-sm font-semibold", RISK_COLORS[result.max_risk])}>
                    {RISK_LABELS[result.max_risk]}
                  </p>
                </div>
                <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-[10px] text-ink-500">Guaranteed Portion</p>
                  <p className="text-sm font-semibold text-emerald-400">{result.guaranteed_pct}%</p>
                </div>
              </div>

              {/* Pie chart + breakdown */}
              <BentoCard title="Your Split">
                <div className="grid gap-4 md:grid-cols-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={result.instruments.map((i: any, idx: number) => ({
                          name: i.name.split("(")[0].trim(),
                          value: i.pct,
                          fill: PIE_COLORS[idx % PIE_COLORS.length],
                        }))}
                        dataKey="value"
                        cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        stroke="rgba(0,0,0,0.3)" strokeWidth={2}
                      >
                        {result.instruments.map((_: any, idx: number) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                        formatter={(v: number) => [`${v}%`, "Allocation"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {result.instruments.map((inst: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                        <span className="flex-1 text-xs text-ink-300 truncate">{inst.name.split("(")[0].trim()}</span>
                        <span className="text-xs text-ink-400">{inst.pct}%</span>
                        <span className="text-xs font-medium text-emerald-400">{fmt(inst.final_value, cur)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </BentoCard>

              {/* Growth chart */}
              <BentoCard title="Combined Growth">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={result.yearly_data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="allocInvestGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="allocValGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `Y${v}`} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v, cur)} width={80} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                      formatter={(v: number) => [fmt(v, cur), ""]}
                      labelFormatter={(v) => `Year ${v}`}
                    />
                    <Area type="monotone" dataKey="invested" stroke="#3b82f6" fill="url(#allocInvestGrad)" name="Invested" />
                    <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#allocValGrad)" name="Value" />
                  </AreaChart>
                </ResponsiveContainer>
              </BentoCard>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <div className="text-center">
                <PieIcon size={32} className="mx-auto text-ink-500" />
                <p className="mt-2 text-sm text-ink-400">
                  {totalPct !== 100
                    ? `Adjust allocations to total 100% (currently ${totalPct}%)`
                    : "Loading projections..."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    green: "text-green-400",
    amber: "text-amber-400",
  };
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
      <p className="text-[10px] text-ink-500">{label}</p>
      <p className={cn("mt-1 text-lg font-bold", colorMap[accent] || "text-ink-200")}>{value}</p>
    </div>
  );
}

/* ─── SIP Calculator Tab ──────────────────────────────────────────── */
function SIPTab({ cur }: { cur: string }) {
  const [monthly, setMonthly] = useState(1000);
  const [rate, setRate] = useState(7);
  const [years, setYears] = useState(10);
  const [stepUp, setStepUp] = useState(0);

  const { data, isFetching } = useQuery({
    queryKey: ["sip", monthly, rate, years, stepUp],
    queryFn: () => api.sipCalc(monthly, rate, years, stepUp),
    staleTime: Infinity,
  });

  const presets = [
    { label: "Student", amount: 1000, rate: 7, years: 10, stepUp: 10 },
    { label: "Starter", amount: 5000, rate: 8, years: 15, stepUp: 10 },
    { label: "Serious", amount: 10000, rate: 10, years: 20, stepUp: 15 },
    { label: "Aggressive", amount: 25000, rate: 12, years: 25, stepUp: 10 },
  ];

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => { setMonthly(p.amount); setRate(p.rate); setYears(p.years); setStepUp(p.stepUp); }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:bg-white/10"
          >
            {p.label} ({cur}{p.amount}/mo)
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Controls */}
        <BentoCard title="SIP Parameters" className="lg:col-span-1">
          <div className="space-y-4">
            <SliderInput label="Monthly SIP" value={monthly} min={100} max={100000} step={100}
              onChange={setMonthly} format={(v) => `${cur}${v.toLocaleString()}`} />
            <SliderInput label="Expected Return" value={rate} min={4} max={18} step={0.5}
              onChange={setRate} format={(v) => `${v}%`} />
            <SliderInput label="Duration" value={years} min={1} max={40} step={1}
              onChange={setYears} format={(v) => `${v} years`} />
            <SliderInput label="Annual Step-up" value={stepUp} min={0} max={25} step={1}
              onChange={setStepUp} format={(v) => `${v}%`} />
          </div>

          {data && (
            <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
              <SummaryRow label="Total Invested" value={fmt(data.total_invested, cur)} />
              <SummaryRow label="Final Value" value={fmt(data.final_value, cur)} highlight />
              <SummaryRow label="Total Gains" value={fmt(data.total_gains, cur)} />
              <SummaryRow label="Returns" value={`${data.gains_pct}%`} />
            </div>
          )}
        </BentoCard>

        {/* Chart */}
        <BentoCard title="Growth Over Time" className="lg:col-span-2">
          {data?.yearly_data && (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.yearly_data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `Y${v}`} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v, cur)} width={80} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                  formatter={(v: number) => [fmt(v, cur), ""]}
                  labelFormatter={(v) => `Year ${v}`}
                />
                <Area type="monotone" dataKey="invested" stroke="#3b82f6" fill="url(#gainGrad)" name="Invested" />
                <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#investGrad)" name="Value" />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Pie split */}
          {data && (
            <div className="mt-2 flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-xs text-ink-400">Invested: {fmt(data.total_invested, cur)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-xs text-ink-400">Gains: {fmt(data.total_gains, cur)}</span>
              </div>
            </div>
          )}
        </BentoCard>
      </div>

      {/* What ₹1000/month becomes */}
      <BentoCard title={`What ${cur}1,000/month becomes`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { years: 5, rate: 7, label: "PPF/FD (5y)" },
            { years: 10, rate: 7, label: "PPF/FD (10y)" },
            { years: 15, rate: 10, label: "Index Fund (15y)" },
            { years: 20, rate: 12, label: "ELSS (20y)" },
          ].map((s) => {
            const r = computeSIP(1000, s.rate, s.years);
            return (
              <div key={s.label} className="rounded-xl bg-white/5 p-3 text-center">
                <p className="text-[10px] text-ink-500">{s.label}</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">{fmt(r.value, cur)}</p>
                <p className="text-[10px] text-ink-500">invested {fmt(r.invested, cur)}</p>
                <p className="text-xs text-emerald-400/70">+{r.gainsPct}% gains</p>
              </div>
            );
          })}
        </div>
      </BentoCard>
    </div>
  );
}

function computeSIP(monthly: number, rate: number, years: number) {
  const mr = rate / 100 / 12;
  const months = years * 12;
  const invested = monthly * months;
  const value = monthly * ((Math.pow(1 + mr, months) - 1) / mr) * (1 + mr);
  return {
    invested: Math.round(invested),
    value: Math.round(value),
    gainsPct: Math.round((value - invested) / invested * 100),
  };
}

/* ─── Goal Planner Tab ────────────────────────────────────────────── */
function GoalTab({ cur }: { cur: string }) {
  const [target, setTarget] = useState(500000);
  const [years, setYears] = useState(5);
  const [rate, setRate] = useState(7);

  const { data } = useQuery({
    queryKey: ["goal", target, years, rate],
    queryFn: () => api.goalPlan(target, years, rate),
    staleTime: Infinity,
  });

  const goals = [
    { label: "Emergency Fund", target: 100000, years: 2, icon: "🛡️" },
    { label: "Vacation", target: 200000, years: 1, icon: "✈️" },
    { label: "Bike", target: 150000, years: 3, icon: "🏍️" },
    { label: "Wedding", target: 2000000, years: 5, icon: "💍" },
    { label: "House Down Payment", target: 1500000, years: 7, icon: "🏠" },
    { label: "Child Education", target: 5000000, years: 15, icon: "🎓" },
  ];

  return (
    <div className="space-y-4">
      {/* Goal presets */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {goals.map((g) => (
          <button
            key={g.label}
            onClick={() => { setTarget(g.target); setYears(g.years); }}
            className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center transition hover:bg-white/10"
          >
            <span className="text-xl">{g.icon}</span>
            <span className="text-xs font-medium text-ink-200">{g.label}</span>
            <span className="text-[10px] text-ink-500">{fmt(g.target, cur)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoCard title="Your Goal">
          <div className="space-y-4">
            <SliderInput label="Target Amount" value={target} min={10000} max={10000000} step={10000}
              onChange={setTarget} format={(v) => fmt(v, cur)} />
            <SliderInput label="Time Horizon" value={years} min={1} max={30} step={1}
              onChange={setYears} format={(v) => `${v} years`} />
            <SliderInput label="Expected Return" value={rate} min={4} max={15} step={0.5}
              onChange={setRate} format={(v) => `${v}%`} />
          </div>
        </BentoCard>

        <BentoCard title="Result">
          {data && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="text-center">
                <p className="text-sm text-ink-400">To reach {fmt(data.target_amount, cur)} in {data.years} years</p>
                <p className="mt-2 text-4xl font-bold text-emerald-400">
                  {fmt(data.monthly_sip_needed, cur)}<span className="text-lg text-ink-400">/month</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center w-full">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-ink-500">You Invest</p>
                  <p className="text-sm font-semibold text-blue-400">{fmt(data.total_invested, cur)}</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-ink-500">Market Gives You</p>
                  <p className="text-sm font-semibold text-emerald-400">{fmt(data.gains, cur)}</p>
                </div>
              </div>
              {/* Compare rates */}
              <div className="w-full space-y-1">
                <p className="text-[10px] text-ink-500 uppercase">Monthly SIP needed at different rates</p>
                {[6, 8, 10, 12].map((r) => {
                  const mr = r / 100 / 12;
                  const m = data.years * 12;
                  const sip = mr === 0 ? data.target_amount / m : data.target_amount * mr / (Math.pow(1 + mr, m) - 1);
                  return (
                    <div key={r} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
                      <span className="text-xs text-ink-400">{r}% return</span>
                      <span className={cn("text-xs font-medium", r === rate ? "text-emerald-400" : "text-ink-200")}>
                        {fmt(Math.round(sip), cur)}/mo
                        {r === rate && " ← selected"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </BentoCard>
      </div>
    </div>
  );
}

/* ─── AI Advisor Tab ──────────────────────────────────────────────── */
function AdvisorTab({ country, cur }: { country: string; cur: string }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [input, setInput] = useState("");
  const [profile, setProfile] = useState("ultra_safe");
  const [monthlyBudget, setMonthlyBudget] = useState(1000);
  const [age, setAge] = useState("student");

  const mutation = useMutation({
    mutationFn: (question: string) =>
      api.investAdvise(question, {
        risk_profile: profile,
        monthly_amount: monthlyBudget,
        country,
        age,
      }),
    onSuccess: (data, question) => {
      setMessages((prev) => [...prev, { role: "ai", text: data.answer }]);
    },
  });

  const ask = useCallback((q: string) => {
    if (!q.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    mutation.mutate(q);
  }, [mutation]);

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {/* Config sidebar */}
      <BentoCard title="Your Profile" className="lg:col-span-1">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-ink-500 uppercase">I am a...</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {["student", "working", "parent", "retiree"].map((a) => (
                <button
                  key={a}
                  onClick={() => setAge(a)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs capitalize transition border",
                    age === a
                      ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-300"
                      : "border-white/5 text-ink-400 hover:text-ink-200"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase">Risk tolerance</label>
            <div className="mt-1 space-y-1">
              {[
                { id: "ultra_safe", label: "Zero Loss", icon: Lock },
                { id: "conservative", label: "Minimal Risk", icon: Shield },
                { id: "balanced_safe", label: "Small Risk OK", icon: Zap },
                { id: "growth", label: "Long-term Growth", icon: TrendingUp },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setProfile(id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition border",
                    profile === id
                      ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-300"
                      : "border-white/5 text-ink-400 hover:text-ink-200"
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-ink-500 uppercase">Monthly budget</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {[500, 1000, 2000, 5000, 10000, 25000].map((b) => (
                <button
                  key={b}
                  onClick={() => setMonthlyBudget(b)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs transition border",
                    monthlyBudget === b
                      ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-300"
                      : "border-white/5 text-ink-400 hover:text-ink-200"
                  )}
                >
                  {cur}{b >= 1000 ? `${b / 1000}K` : b}
                </button>
              ))}
            </div>
          </div>
        </div>
      </BentoCard>

      {/* Chat */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        {/* Quick questions */}
        {messages.length === 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-ink-300 transition hover:bg-white/10 hover:text-ink-100"
              >
                <ChevronRight size={14} className="shrink-0 text-emerald-400" />
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl p-4 text-sm",
                m.role === "user"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 ml-12"
                  : "bg-white/5 border border-white/10 text-ink-200 mr-4"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {m.role === "ai" ? <Bot size={14} className="text-emerald-400" /> : <Wallet size={14} />}
                <span className="text-[10px] text-ink-500 uppercase">{m.role === "ai" ? "AI Advisor" : "You"}</span>
              </div>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          ))}
          {mutation.isPending && (
            <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-4">
              <Loader2 size={16} className="animate-spin text-emerald-400" />
              <span className="text-sm text-ink-400">Thinking...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ask(input)}
            placeholder="Ask anything about safe investing..."
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-emerald-500/30"
          />
          <button
            onClick={() => ask(input)}
            disabled={mutation.isPending || !input.trim()}
            className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-yellow-500" />
          <p className="text-[10px] text-yellow-500/70">
            This is educational guidance, not financial advice. Past returns don&apos;t guarantee future results.
            Always do your own research before investing. Consult a SEBI-registered advisor for personalized advice.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Shared Components ────────────────────────────────────────────── */
function SliderInput({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-ink-400">{label}</label>
        <span className="text-sm font-semibold text-emerald-400">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-emerald-500 h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
          [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(16,185,129,0.4)]"
      />
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-400">{label}</span>
      <span className={cn("text-sm font-semibold", highlight ? "text-emerald-400" : "text-ink-200")}>{value}</span>
    </div>
  );
}
