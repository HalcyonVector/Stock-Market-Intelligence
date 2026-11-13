"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

const sym = (cur: string) => (cur === "INR" ? "₹" : "$");
const short = (v: number, cur: string) => {
  const a = Math.abs(v);
  if (cur === "INR") return `₹${a >= 1e7 ? (v / 1e7).toFixed(2) + "Cr" : a >= 1e5 ? (v / 1e5).toFixed(1) + "L" : Math.round(v).toLocaleString("en-IN")}`;
  return `$${a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : Math.round(v)}`;
};

/** Daily account value vs. putting the same money in the index. Rebuilt on
 *  the server from the trade log, so nothing extra is stored. */
export function EquityCurve({ version }: { version: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["paper-history", version],
    queryFn: () => api.paperHistory(),
    staleTime: 10 * 60_000,
  });
  const curves = data?.curves ?? {};
  const currencies = Object.keys(curves);
  const [picked, setPicked] = useState<string | null>(null);
  const cur = picked && curves[picked] ? picked : currencies[0];
  const c = cur ? curves[cur] : null;

  const last = c?.points?.[c.points.length - 1];
  const first = c?.points?.[0];
  const you = last && first ? (last.equity / first.equity - 1) * 100 : null;
  const idx = last?.benchmark && first?.benchmark ? (last.benchmark / first.benchmark - 1) * 100 : null;

  return (
    <BentoCard
      span="col-span-12" title="Performance"
      subtitle={c?.benchmark ? `Your account vs. the same money in the ${c.benchmark}` : "Your account value by day"}
      action={currencies.length > 1 ? (
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
          {currencies.map((k) => (
            <button key={k} onClick={() => setPicked(k)}
              className={cn("rounded-md px-2 py-0.5 text-[11px]", k === cur ? "bg-white/10 text-ink-100" : "text-ink-400")}>
              {k}
            </button>
          ))}
        </div>
      ) : undefined}
    >
      {isLoading && <div className="h-56 animate-pulse rounded-xl bg-white/[0.03]" />}
      {isError && <p className="py-8 text-center text-xs text-ink-500">Couldn&apos;t load the history right now.</p>}
      {!isLoading && !isError && !c && (
        <p className="py-8 text-center text-sm text-ink-500">Your performance chart appears after your first trade.</p>
      )}
      {c && c.points.length > 0 && (
        <>
          {c.points.length < 3 && (
            <p className="mb-2 text-[11px] text-ink-500">Only a day or two of history so far. Check back after a few trading days.</p>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={c.points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} minTickGap={32}
                tickFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => short(v, cur!)} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                formatter={(v: number) => `${sym(cur!)}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="equity" name="You" stroke="#f43f5e" dot={false} strokeWidth={2} />
              {c.benchmark && <Line type="monotone" dataKey="benchmark" name={c.benchmark} stroke="#94a3b8" dot={false} strokeDasharray="4 3" />}
            </LineChart>
          </ResponsiveContainer>
          {you !== null && (
            <p className="mt-2 text-xs text-ink-400">
              Over this period you&apos;re <span className={you >= 0 ? "text-emerald-400" : "text-red-400"}>{you >= 0 ? "+" : ""}{you.toFixed(2)}%</span>
              {idx !== null && <> vs. the index&apos;s <span className={idx >= 0 ? "text-emerald-400" : "text-red-400"}>{idx >= 0 ? "+" : ""}{idx.toFixed(2)}%</span></>}.
              {c.truncated && " Very old trades have been trimmed, so the chart starts later."}
            </p>
          )}
        </>
      )}
    </BentoCard>
  );
}
