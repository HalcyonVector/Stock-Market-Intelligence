"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { UserCheck, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

function formatValue(v: number | null | undefined): string {
  if (v == null) return "n/a";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$" + (v / 1_000).toFixed(0) + "K";
  return "$" + v.toFixed(0);
}

function formatShares(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

export function InsiderActivity() {
  const { data, isLoading, dataUpdatedAt, isError, refetch } = useQuery({
    queryKey: ["insider-activity"],
    queryFn: () => api.insiderActivity(),
    staleTime: 10 * 60 * 1000,
  });

  const items = (data ?? []).slice(0, 12);

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()} updatedAt={dataUpdatedAt}
      span="col-span-12 lg:col-span-4"
      title="Insider Activity"
      subtitle="US insider filings (SEC Form 4), last 90 days"
      icon={<UserCheck size={14} className="text-amber-400" />}
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-relaxed text-ink-500">
          No insider filings found for the stocks checked so far. The list fills in over a few hours as each
          tracked US stock is checked; Indian companies don&apos;t file Form 4.
        </p>
      ) : (
        <div className="space-y-0.5">
          {items.map((t: any, i: number) => {
            const kind: string = t.kind ?? t.transaction_type;
            const isBuy = kind === "Buy";
            const isSell = kind === "Sell";
            return (
              <motion.div
                key={`${t.symbol}-${t.name}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                <Link
                  href={`/stock/${t.symbol}`}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
                >
                  {/* Buy/Sell icon */}
                  <span
                    className={cn(
                      "flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md",
                      isBuy
                        ? "bg-emerald-500/15 text-emerald-400"
                        : isSell
                          ? "bg-crimson-500/15 text-crimson-400"
                          : "bg-white/5 text-ink-400"
                    )}
                    title={t.label}
                  >
                    {isBuy ? (
                      <ArrowUpRight size={11} />
                    ) : (
                      <ArrowDownRight size={11} />
                    )}
                  </span>

                  {/* Symbol */}
                  <span className="font-mono text-[12px] font-bold text-ink-100 min-w-[50px] group-hover:text-crimson-300 transition-colors">
                    {t.symbol}
                  </span>

                  {/* Name + title */}
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-[10px] text-ink-300">{t.name}</span>
                    <span className="block truncate text-[9px] text-ink-500">
                      {t.label ?? kind}
                      {t.date ? ` · ${new Date(t.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                      {t.sample ? " · sample" : ""}
                    </span>
                  </div>

                  {/* Shares */}
                  <span className="text-[10px] font-mono text-ink-500 min-w-[32px] text-right">
                    {formatShares(t.shares ?? 0)}
                  </span>

                  {/* Value pill */}
                  <span
                    className={cn(
                      "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                      isBuy
                        ? "text-emerald-400 bg-emerald-500/10"
                        : isSell
                          ? "text-crimson-400 bg-crimson-500/10"
                          : "text-ink-400 bg-white/5"
                    )}
                    title={t.value == null ? "No price on this filing (grants and exercises often have none)" : undefined}
                  >
                    {formatValue(t.value ?? 0)}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}
