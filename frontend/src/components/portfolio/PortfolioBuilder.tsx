"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Play, Save, Trash2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

interface Props {
  onAnalyze: (symbols: string[]) => void;
  isAnalyzing: boolean;
  currentSymbols: string[];
}

const POPULAR = [
  { group: "US Tech", symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] },
  { group: "US Finance", symbols: ["JPM", "GS", "BAC", "WFC", "MS", "BLK", "V"] },
  { group: "US Healthcare", symbols: ["UNH", "JNJ", "PFE", "ABBV", "MRK", "LLY", "TMO"] },
  { group: "India Large", symbols: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "HINDUNILVR.NS"] },
  { group: "ETFs", symbols: ["SPY", "QQQ", "IWM", "EEM", "GLD", "TLT", "VTI"] },
];

export function PortfolioBuilder({ onAnalyze, isAnalyzing, currentSymbols }: Props) {
  const [symbols, setSymbols] = useState<string[]>(currentSymbols);
  const [input, setInput] = useState("");
  const [saveName, setSaveName] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  const qc = useQueryClient();
  const { data: saved } = useQuery({
    queryKey: ["savedPortfolios"],
    queryFn: () => api.savedPortfolios(),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.savePortfolio(saveName, symbols),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["savedPortfolios"] }); setSaveName(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deletePortfolio(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savedPortfolios"] }),
  });

  const addSymbol = (s: string) => {
    const sym = s.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols([...symbols, sym]);
    }
  };

  const removeSymbol = (s: string) => {
    setSymbols(symbols.filter((x) => x !== s));
  };

  const loadPreset = (syms: string[]) => {
    const merged = [...new Set([...symbols, ...syms])];
    setSymbols(merged);
  };

  const loadSaved = (portfolio: any) => {
    setSymbols(portfolio.symbols);
    setShowSaved(false);
  };

  return (
    <BentoCard span="col-span-12" title="Portfolio Builder"
      subtitle={`${symbols.length} assets selected · min 3 required`}
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-ink-300 hover:bg-white/5 transition"
          >
            <FolderOpen size={12} /> Saved ({(saved ?? []).length})
          </button>
          <button
            onClick={() => onAnalyze(symbols)}
            disabled={symbols.length < 3 || isAnalyzing}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition",
              symbols.length >= 3
                ? "bg-crimson-600 text-white hover:bg-crimson-500"
                : "bg-white/5 text-ink-500 cursor-not-allowed"
            )}
          >
            <Play size={12} /> {isAnalyzing ? "Running…" : "Analyze"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                // Support comma-separated
                input.split(",").forEach((s) => addSymbol(s));
                setInput("");
              }
            }}
            placeholder="Type ticker and press Enter (e.g. AAPL, MSFT, GOOGL)"
            className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-ink-500 focus:border-crimson-500/40"
          />
          <button
            onClick={() => { input.split(",").forEach((s) => addSymbol(s)); setInput(""); }}
            className="rounded-lg border border-white/10 px-3 py-2 text-ink-300 hover:bg-white/5 transition"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Selected symbols */}
        <div className="flex flex-wrap gap-1.5">
          {symbols.map((s) => (
            <span
              key={s}
              className="group flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-mono transition hover:border-crimson-500/30"
            >
              {s}
              <button onClick={() => removeSymbol(s)} className="text-ink-500 hover:text-crimson-400 transition">
                <X size={12} />
              </button>
            </span>
          ))}
          {symbols.length === 0 && (
            <span className="text-xs text-ink-500">No assets selected. Add tickers above or pick a preset below.</span>
          )}
        </div>

        {/* Quick presets */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-500">Quick Add</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((p) => (
              <button
                key={p.group}
                onClick={() => loadPreset(p.symbols)}
                className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 text-[11px] text-ink-300 transition hover:border-crimson-500/20 hover:bg-white/[0.03]"
              >
                {p.group} <span className="text-ink-500">({p.symbols.length})</span>
              </button>
            ))}
            <button
              onClick={() => setSymbols([])}
              className="rounded-lg border border-white/5 px-2.5 py-1.5 text-[11px] text-ink-500 hover:text-crimson-400 transition"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Save */}
        {symbols.length >= 3 && (
          <div className="flex items-center gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Portfolio name"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs outline-none placeholder:text-ink-500 focus:border-crimson-500/40"
            />
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!saveName.trim()}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-300 hover:bg-white/5 transition disabled:opacity-30"
            >
              <Save size={12} /> Save
            </button>
          </div>
        )}

        {/* Saved portfolios dropdown */}
        {showSaved && (saved ?? []).length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-ink-500">Saved Portfolios</p>
            <div className="space-y-1.5">
              {(saved ?? []).map((p: any) => (
                <div key={p.name} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <button onClick={() => loadSaved(p)} className="flex-1 text-left text-xs text-ink-100">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-ink-500">{p.symbols.length} assets · {p.symbols.slice(0, 4).join(", ")}{p.symbols.length > 4 ? "…" : ""}</span>
                  </button>
                  <button onClick={() => deleteMutation.mutate(p.name)} className="text-ink-500 hover:text-crimson-400 transition">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BentoCard>
  );
}
