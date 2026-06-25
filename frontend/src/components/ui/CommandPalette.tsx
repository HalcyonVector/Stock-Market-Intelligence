"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const SUGGESTED = ["AAPL", "NVDA", "TSLA", "PLTR", "RELIANCE", "HAL", "INFY"];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;
  const go = (s: string) => { onClose(); router.push(`/stock/${s.toUpperCase()}`); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-32 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-full max-w-xl p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-3">
          <Search size={16} className="text-ink-500" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && q && go(q)}
            placeholder="Search a ticker…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED.filter((s) => s.includes(q.toUpperCase())).map((s) => (
            <button key={s} onClick={() => go(s)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:border-crimson-500/40">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
