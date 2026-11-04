"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Link2, Loader2, Plus, Star, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

const btn =
  "flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink-200 transition hover:border-crimson-500/30 hover:bg-white/10";

function AddToWatchlist({ symbol }: { symbol: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["watchlists"],
    queryFn: api.watchlists,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const add = useMutation({
    mutationFn: async (id: number | null) => {
      const wid = id ?? (await api.createWatchlist("My Watchlist")).id;
      return api.addToWatchlist(wid, symbol);
    },
    onSuccess: (wl: any) => {
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      toast(`Added ${symbol} to ${wl?.name ?? "watchlist"}`, { tone: "success", href: "/watchlists" });
      setOpen(false);
    },
    onError: (e: Error) => toast("Couldn't add to watchlist", { body: e.message, tone: "error" }),
  });

  return (
    <div ref={ref} className="relative">
      <button className={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <Star size={13} /> Watchlist
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-white/10 bg-base-900 p-1 shadow-xl">
          {isLoading && <p className="px-3 py-2 text-xs text-ink-500">Loading…</p>}
          {lists.map((wl: any) => {
            const has = wl.items?.some((i: any) => i.symbol === symbol);
            return (
              <button
                key={wl.id}
                role="menuitem"
                disabled={has || add.isPending}
                onClick={() => add.mutate(wl.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-ink-200 hover:bg-white/5 disabled:opacity-50"
              >
                <span className="truncate">{wl.name}</span>
                {has ? <Check size={12} className="text-emerald-400" /> : <Plus size={12} />}
              </button>
            );
          })}
          {!isLoading && lists.length === 0 && (
            <button
              role="menuitem"
              onClick={() => add.mutate(null)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-ink-200 hover:bg-white/5"
            >
              {add.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Create &quot;My Watchlist&quot; and add
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StockActions({ symbol }: { symbol: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied", { tone: "success", ttl: 2500 });
    } catch {
      toast("Couldn't copy the link", { tone: "error" });
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <AddToWatchlist symbol={symbol} />
      <Link href={`/alerts?symbol=${encodeURIComponent(symbol)}`} className={btn}>
        <Bell size={13} /> Alert
      </Link>
      <Link href={`/paper?symbol=${encodeURIComponent(symbol)}`} className={cn(btn)}>
        <Wallet size={13} /> Paper trade
      </Link>
      <button onClick={copy} className={btn} aria-label="Copy link to this page">
        <Link2 size={13} /> Share
      </button>
    </div>
  );
}
