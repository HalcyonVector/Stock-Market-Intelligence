"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { scoreColor, pct, changeColor } from "@/lib/utils";

export function OpportunityRadar() {
  const { data } = useQuery({ queryKey: ["discovery"], queryFn: () => api.discovery() });
  const rows = (data ?? []).slice(0, 7);
  return (
    <BentoCard span="col-span-12 lg:col-span-3" title="Opportunity Radar" subtitle="Ranked by composite score">
      <ul className="space-y-2">
        {rows.map((r: any, i: number) => (
          <li key={r.symbol}>
            <Link href={`/stock/${r.symbol}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-white/5">
              <span className="flex items-center gap-2">
                <span className="w-4 text-xs text-ink-500">{i + 1}</span>
                <span className="font-mono text-sm">{r.symbol}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={`text-xs ${changeColor(r.change_pct)}`}>{pct(r.change_pct)}</span>
                <span className={`font-mono text-sm font-semibold ${scoreColor(r.opportunity)}`}>
                  {r.opportunity}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <p className="text-xs text-ink-500">Loading discovery scan…</p>}
      </ul>
    </BentoCard>
  );
}
