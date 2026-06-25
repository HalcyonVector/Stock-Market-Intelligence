"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Trash2, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn, pct, changeColor } from "@/lib/utils";

export default function WatchlistsPage() {
  const [newName, setNewName] = useState("");
  const [addSymbol, setAddSymbol] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: lists, isLoading } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => api.watchlists(),
  });

  const { data: detail } = useQuery({
    queryKey: ["watchlist", expanded],
    queryFn: () => api.getWatchlist(expanded!),
    enabled: expanded !== null,
  });

  const createMut = useMutation({
    mutationFn: () => api.createWatchlist(newName),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["watchlists"] }); setNewName(""); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteWatchlist(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["watchlists"] }); if (expanded) setExpanded(null); },
  });

  const addMut = useMutation({
    mutationFn: ({ id, sym }: { id: number; sym: string }) => api.addToWatchlist(id, sym),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["watchlist", id] });
      setAddSymbol((s) => ({ ...s, [id]: "" }));
    },
  });

  const removeMut = useMutation({
    mutationFn: ({ id, sym }: { id: number; sym: string }) => api.removeFromWatchlist(id, sym),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["watchlist", id] });
    },
  });

  const quotesMap: Record<string, any> = {};
  (detail?.quotes ?? []).forEach((q: any) => { quotesMap[q.symbol] = q; });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Eye size={24} className="text-crimson-400" /> Watchlists
        </h1>
        <p className="text-sm text-ink-500">Track stocks across custom lists with live quotes</p>
      </div>

      {/* Create */}
      <BentoCard span="col-span-12" title="Create Watchlist">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMut.mutate(); }}
            placeholder="Watchlist name (e.g. Tech Picks, Dividend Kings)"
            className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-ink-500 focus:border-crimson-500/40"
          />
          <button
            onClick={() => createMut.mutate()}
            disabled={!newName.trim()}
            className="flex items-center gap-1 rounded-lg bg-crimson-600 px-4 py-2 text-sm font-medium text-white hover:bg-crimson-500 transition disabled:opacity-30"
          >
            <Plus size={14} /> Create
          </button>
        </div>
      </BentoCard>

      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-crimson-400" />
        </div>
      )}

      {!isLoading && (lists ?? []).length === 0 && (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-white/10">
          <p className="text-sm text-ink-500">No watchlists yet. Create one above.</p>
        </div>
      )}

      {/* Watchlist cards */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {(lists ?? []).map((wl: any) => {
          const isExpanded = expanded === wl.id;
          return (
            <div
              key={wl.id}
              className={cn(
                "rounded-2xl border bg-white/[0.02] backdrop-blur-xl transition",
                isExpanded ? "border-crimson-500/30 col-span-full" : "border-white/5 hover:border-white/10"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4">
                <button onClick={() => setExpanded(isExpanded ? null : wl.id)} className="flex-1 text-left">
                  <h3 className="font-medium text-ink-100">{wl.name}</h3>
                  <p className="text-xs text-ink-500">{wl.items.length} stocks</p>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : wl.id)}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-ink-300 hover:bg-white/5 transition"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                  <button
                    onClick={() => deleteMut.mutate(wl.id)}
                    className="text-ink-500 hover:text-crimson-400 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Symbol tags (collapsed view) */}
              {!isExpanded && wl.items.length > 0 && (
                <div className="flex flex-wrap gap-1 px-4 pb-3">
                  {wl.items.slice(0, 8).map((item: any) => (
                    <span key={item.id} className="rounded-md border border-white/5 bg-black/20 px-2 py-0.5 font-mono text-[11px] text-ink-300">
                      {item.symbol}
                    </span>
                  ))}
                  {wl.items.length > 8 && (
                    <span className="text-[11px] text-ink-500">+{wl.items.length - 8} more</span>
                  )}
                </div>
              )}

              {/* Expanded: add + full quote table */}
              {isExpanded && (
                <div className="space-y-3 px-4 pb-4">
                  {/* Add stock */}
                  <div className="flex gap-2">
                    <input
                      value={addSymbol[wl.id] ?? ""}
                      onChange={(e) => setAddSymbol((s) => ({ ...s, [wl.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (addSymbol[wl.id] ?? "").trim()) {
                          addMut.mutate({ id: wl.id, sym: addSymbol[wl.id] });
                        }
                      }}
                      placeholder="Add ticker (e.g. AAPL)"
                      className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm outline-none placeholder:text-ink-500 focus:border-crimson-500/40"
                    />
                    <button
                      onClick={() => addMut.mutate({ id: wl.id, sym: addSymbol[wl.id] ?? "" })}
                      disabled={!(addSymbol[wl.id] ?? "").trim()}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 hover:bg-white/5 transition disabled:opacity-30"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Quote table */}
                  {wl.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-ink-500">
                            <th className="py-1.5 text-left font-medium">Symbol</th>
                            <th className="py-1.5 text-right font-medium">Price</th>
                            <th className="py-1.5 text-right font-medium">Change</th>
                            <th className="py-1.5 text-right font-medium">%</th>
                            <th className="py-1.5 text-right font-medium">Volume</th>
                            <th className="py-1.5 w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {wl.items.map((item: any) => {
                            const q = quotesMap[item.symbol];
                            return (
                              <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                <td className="py-2">
                                  <Link href={`/stock/${item.symbol}`} className="font-mono font-medium text-ink-100 hover:text-crimson-300 transition">
                                    {item.symbol}
                                  </Link>
                                </td>
                                <td className="py-2 text-right font-mono text-ink-100">
                                  {q ? `$${q.price?.toFixed(2)}` : "—"}
                                </td>
                                <td className={cn("py-2 text-right font-mono", changeColor(q?.change ?? 0))}>
                                  {q ? `${q.change >= 0 ? "+" : ""}${q.change?.toFixed(2)}` : "—"}
                                </td>
                                <td className={cn("py-2 text-right font-mono", changeColor(q?.change_pct ?? 0))}>
                                  {q ? pct(q.change_pct) : "—"}
                                </td>
                                <td className="py-2 text-right font-mono text-ink-300">
                                  {q?.volume ? (q.volume / 1e6).toFixed(1) + "M" : "—"}
                                </td>
                                <td className="py-2 text-right">
                                  <button
                                    onClick={() => removeMut.mutate({ id: wl.id, sym: item.symbol })}
                                    className="text-ink-500 hover:text-crimson-400 transition"
                                  >
                                    <X size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
