"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTED = ["AAPL", "NVDA", "TSLA", "PLTR", "RELIANCE", "HAL", "INFY"];

type Hit = { symbol: string; name: string; market: string; tracked: boolean };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Search any US or NSE/BSE stock (not only the ones the dashboards scan). */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const term = useDebounced(q.trim(), 250);
  const listRef = useRef<HTMLUListElement>(null);

  const { data: hits = [], isFetching } = useQuery<Hit[]>({
    queryKey: ["search", term.toUpperCase()],
    queryFn: () => api.search(term),
    enabled: open && term.length >= 1,
    staleTime: 60 * 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (!open) { setQ(""); setActive(0); } }, [open]);
  useEffect(() => setActive(0), [term]);

  if (!open) return null;
  const go = (s: string) => { onClose(); router.push(`/stock/${encodeURIComponent(s.toUpperCase())}`); };
  const showHits = term.length >= 1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1))); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter" && q.trim()) go(hits[active]?.symbol ?? q.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24 backdrop-blur-sm sm:pt-32" onClick={onClose}>
      <div role="dialog" aria-label="Search stocks" className="glass w-full max-w-xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-3">
          <Search size={16} className="text-ink-500" aria-hidden />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search any stock by name or ticker (e.g. Apple, IRCTC)…"
            aria-label="Search stocks"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
          {isFetching && <Loader2 size={14} className="animate-spin text-ink-500" aria-hidden />}
        </div>

        {showHits ? (
          <ul ref={listRef} className="mt-2 max-h-80 overflow-y-auto" role="listbox">
            {hits.map((h, i) => (
              <li key={h.symbol} role="option" aria-selected={i === active}>
                <button
                  onClick={() => go(h.symbol)} onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left",
                    i === active ? "bg-white/10" : "hover:bg-white/5")}
                >
                  <span className="w-28 shrink-0 truncate font-mono text-sm font-semibold">{h.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-400">{h.name || (h.tracked ? "Tracked on the dashboards" : "")}</span>
                  <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-400">{h.market === "IN" ? "NSE" : "US"}</span>
                </button>
              </li>
            ))}
            {!isFetching && !hits.length && term === q.trim() && (
              <li className="px-2 py-3 text-xs text-ink-500">
                No matches. Press Enter to open <span className="font-mono">{q.trim().toUpperCase()}</span> anyway
                (Indian stocks outside the tracked list need a <span className="font-mono">.NS</span> suffix).
              </li>
            )}
          </ul>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => go(s)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:border-crimson-500/40">
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 px-2 text-[10px] text-ink-500">
          Stocks outside the tracked list get daily prices after you add them to a watchlist (synced twice a day).
        </p>
      </div>
    </div>
  );
}
