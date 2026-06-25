"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { Sparkline } from "@/components/ui/Sparkline";
import { pct, changeColor, cn } from "@/lib/utils";

function generateMiniTrend(changePct: number): number[] {
  // Simulate a 12-point mini trend based on change direction
  const points: number[] = [];
  let val = 100;
  for (let i = 0; i < 12; i++) {
    val += (changePct / 12) + (Math.random() - 0.5) * Math.abs(changePct) * 0.3;
    points.push(val);
  }
  return points;
}

function MoverRow({ q }: { q: any }) {
  const trend = generateMiniTrend(q.change_pct);
  return (
    <Link
      href={`/stock/${q.symbol}`}
      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5"
    >
      <span className="flex items-center gap-2">
        <span className="font-mono font-medium text-ink-100">{q.symbol}</span>
        <span className="text-xs text-ink-500">${q.price?.toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-2">
        <Sparkline data={trend} width={48} height={16} />
        <span className={cn("w-16 text-right font-mono text-xs", changeColor(q.change_pct))}>
          {pct(q.change_pct)}
        </span>
      </span>
    </Link>
  );
}

function Col({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-ink-500">{title}</p>
      <div className="space-y-0.5">
        {rows.map((q) => (
          <MoverRow key={q.symbol} q={q} />
        ))}
      </div>
    </div>
  );
}

export function MoversList() {
  const { data } = useQuery({ queryKey: ["movers"], queryFn: () => api.movers() });
  return (
    <BentoCard span="col-span-12 lg:col-span-4" title="Live Market Movers">
      <div className="space-y-4">
        <Col title="Gainers" rows={(data?.gainers ?? []).slice(0, 5)} />
        <Col title="Losers" rows={(data?.losers ?? []).slice(0, 5)} />
      </div>
    </BentoCard>
  );
}
