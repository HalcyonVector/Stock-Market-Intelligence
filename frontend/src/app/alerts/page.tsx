"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BellRing, Plus, Trash2, TrendingUp, TrendingDown, ArrowUp,
  ArrowDown, CheckCircle2, Clock, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CONDITIONS = [
  { id: "above", label: "Price Above", icon: ArrowUp, desc: "Triggers when price rises above target" },
  { id: "below", label: "Price Below", icon: ArrowDown, desc: "Triggers when price falls below target" },
  { id: "change_pct_above", label: "% Change Above", icon: TrendingUp, desc: "Triggers when daily gain exceeds %" },
  { id: "change_pct_below", label: "% Change Below", icon: TrendingDown, desc: "Triggers when daily loss exceeds %" },
] as const;

const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOGL", "NVDA", "TSLA", "AMZN", "META",
  "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
];

export default function AlertsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [condition, setCondition] = useState("above");
  const [threshold, setThreshold] = useState<number | "">("");
  const [note, setNote] = useState("");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    refetchInterval: 30000,
  });

  const createMut = useMutation({
    mutationFn: () => api.createAlert(symbol.toUpperCase(), condition, Number(threshold), note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setSymbol(""); setThreshold(""); setNote(""); setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const checkMut = useMutation({
    mutationFn: api.checkAlerts,
    onSuccess: (triggered) => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const active = alerts.filter((a: any) => !a.triggered);
  const triggered = alerts.filter((a: any) => a.triggered);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
              <Bell size={22} />
            </span>
            Price Alerts
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Get notified when stocks hit your target prices
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => checkMut.mutate()}
            disabled={checkMut.isPending}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-white/10"
          >
            {checkMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check Now
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/25"
          >
            <Plus size={16} /> New Alert
          </button>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <BentoCard title="Create Alert">
              <div className="space-y-4">
                {/* Symbol input */}
                <div>
                  <label className="text-xs text-ink-400">Symbol</label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. AAPL, RELIANCE.NS"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-amber-500/30"
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {POPULAR_SYMBOLS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSymbol(s)}
                        className={cn(
                          "rounded-lg px-2 py-1 text-[10px] transition border",
                          symbol === s
                            ? "bg-amber-500/15 border-amber-500/20 text-amber-300"
                            : "border-white/5 text-ink-500 hover:text-ink-300"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Condition */}
                <div>
                  <label className="text-xs text-ink-400">Condition</label>
                  <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {CONDITIONS.map(({ id, label, icon: Icon, desc }) => (
                      <button
                        key={id}
                        onClick={() => setCondition(id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border p-3 transition",
                          condition === id
                            ? "bg-amber-500/15 border-amber-500/20 text-amber-300"
                            : "border-white/10 text-ink-400 hover:bg-white/5"
                        )}
                      >
                        <Icon size={18} />
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-[9px] text-ink-500 text-center">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Threshold + Note */}
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-ink-400">
                      {condition.includes("pct") ? "Percentage (%)" : "Price ($)"}
                    </label>
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value ? Number(e.target.value) : "")}
                      placeholder={condition.includes("pct") ? "e.g. 5" : "e.g. 150.00"}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-amber-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-400">Note (optional)</label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Buy if it dips"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-amber-500/30"
                    />
                  </div>
                </div>

                <button
                  onClick={() => createMut.mutate()}
                  disabled={!symbol || threshold === "" || createMut.isPending}
                  className="flex items-center gap-2 rounded-xl bg-amber-500/20 px-6 py-2.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-40"
                >
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Create Alert
                </button>
              </div>
            </BentoCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Alerts */}
      <BentoCard title={`Active Alerts (${active.length})`}>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="animate-spin text-ink-500" />
          </div>
        ) : active.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <Bell size={28} className="text-ink-600" />
            <p className="mt-2 text-sm text-ink-400">No active alerts</p>
            <p className="text-xs text-ink-500">Create one to get notified when prices hit your targets</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((alert: any) => (
              <AlertRow key={alert.id} alert={alert} onDelete={() => deleteMut.mutate(alert.id)} />
            ))}
          </div>
        )}
      </BentoCard>

      {/* Triggered Alerts */}
      {triggered.length > 0 && (
        <BentoCard title={`Triggered (${triggered.length})`}>
          <div className="space-y-2">
            {triggered.map((alert: any) => (
              <AlertRow key={alert.id} alert={alert} onDelete={() => deleteMut.mutate(alert.id)} triggered />
            ))}
          </div>
        </BentoCard>
      )}
    </div>
  );
}

function AlertRow({ alert, onDelete, triggered }: { alert: any; onDelete: () => void; triggered?: boolean }) {
  const condLabel = CONDITIONS.find((c) => c.id === alert.condition);
  const CondIcon = condLabel?.icon || ArrowUp;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition",
        triggered
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-white/10 bg-white/5"
      )}
    >
      <div className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        triggered ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
      )}>
        {triggered ? <CheckCircle2 size={18} /> : <CondIcon size={18} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-100">{alert.symbol}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-500">
            {condLabel?.label || alert.condition}
          </span>
          <span className="text-sm font-medium text-amber-400">
            {alert.condition.includes("pct") ? `${alert.threshold}%` : `$${alert.threshold}`}
          </span>
        </div>
        {alert.note && <p className="text-xs text-ink-500 truncate">{alert.note}</p>}
        {triggered && alert.trigger_price && (
          <p className="text-xs text-emerald-400">
            Triggered at ${alert.trigger_price?.toFixed(2)} ({alert.trigger_change_pct?.toFixed(2)}%)
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-ink-500">
          <Clock size={10} className="inline mr-1" />
          {new Date(alert.created_at).toLocaleDateString()}
        </span>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-ink-500 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
