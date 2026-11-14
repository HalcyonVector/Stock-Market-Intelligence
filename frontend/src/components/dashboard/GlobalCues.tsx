"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

type Bar = { ts: string; close: number };

function lastMove(bars: Bar[] | undefined) {
  if (!bars || bars.length < 2) return null;
  const a = bars[bars.length - 2], b = bars[bars.length - 1];
  return { date: b.ts.slice(0, 10), pct: (b.close / a.close - 1) * 100 };
}

const signed = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Last night's US session, and what the past year says the Nifty 50 tends to
 *  do at its next session after a US day like it. */
export function GlobalCues() {
  const study = useQuery({ queryKey: ["study"], queryFn: () => api.study(), staleTime: 60 * 60_000 });
  const spy = useQuery({ queryKey: ["candles", "SPY", 10], queryFn: () => api.candles("SPY", "1d", 10), staleTime: 30 * 60_000 });
  const nifty = useQuery({ queryKey: ["candles", "^NSEI", 10], queryFn: () => api.candles(encodeURIComponent("^NSEI"), "1d", 10), staleTime: 30 * 60_000 });

  const cues = study.data?.index_cues;
  const us = lastMove(spy.data as Bar[] | undefined);
  // The Nifty session that followed that US session, if it has happened yet.
  const niftyBars = (nifty.data as Bar[] | undefined) ?? [];
  const nextIdx = us ? niftyBars.findIndex((b) => b.ts.slice(0, 10) > us.date) : -1;
  const followed = nextIdx > 0 ? { date: niftyBars[nextIdx].ts.slice(0, 10), pct: (niftyBars[nextIdx].close / niftyBars[nextIdx - 1].close - 1) * 100 } : null;

  const big = us && cues ? Math.abs(us.pct) >= cues.big_move_threshold_pct : false;
  const avgAfter = us && cues ? (us.pct >= 0 ? cues.after_big_up_avg_nifty_pct : cues.after_big_down_avg_nifty_pct) : null;
  const loading = spy.isLoading || study.isLoading;

  return (
    <BentoCard span="" title="Global Cues" subtitle="Last US session, and how the Nifty 50 usually follows"
      icon={<Globe2 size={14} className="text-sky-400" />}
      error={spy.isError && !spy.data} onRetry={() => spy.refetch()}>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
      ) : !us ? (
        <p className="py-6 text-center text-xs text-ink-500">US price history isn&apos;t available right now.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">S&amp;P 500 · {day(us.date)}</p>
              <p className={cn("font-mono text-xl font-semibold", us.pct >= 0 ? "text-emerald-400" : "text-crimson-400")}>{signed(us.pct)}</p>
              <p className="text-[10px] text-ink-500">{big ? "a big US day" : "an ordinary US day"}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">Nifty 50 next session</p>
              {followed ? (
                <>
                  <p className={cn("font-mono text-xl font-semibold", followed.pct >= 0 ? "text-emerald-400" : "text-crimson-400")}>{signed(followed.pct)}</p>
                  <p className="text-[10px] text-ink-500">{day(followed.date)} · {Math.sign(followed.pct) === Math.sign(us.pct) ? "followed" : "went the other way"}</p>
                </>
              ) : (
                <>
                  <p className="font-mono text-xl font-semibold text-ink-300">pending</p>
                  <p className="text-[10px] text-ink-500">India hasn&apos;t traded since</p>
                </>
              )}
            </div>
          </div>
          {cues ? (
            <p className="text-sm leading-relaxed text-ink-300">
              {big ? (
                <>After US moves of {cues.big_move_threshold_pct}% or more, the Nifty moved the same way at its next session{" "}
                  <span className="font-semibold text-amber-300">{cues.big_days_same_direction_pct}%</span> of the time
                  {avgAfter != null && <> (average {signed(avgAfter)})</>}.</>
              ) : (
                <>On ordinary days the link is weak: the Nifty moved the same way next session{" "}
                  <span className="font-semibold text-ink-100">{cues.all_days_same_direction_pct}%</span> of the time, barely better than a coin flip.
                  It rises to {cues.big_days_same_direction_pct}% after US moves of {cues.big_move_threshold_pct}% or more.</>
              )}
            </p>
          ) : (
            <p className="text-xs text-ink-500">Historical odds appear after the next weekly Market Study run.</p>
          )}
          <p className="text-[10px] text-ink-500">
            Past {cues?.sessions ?? "year's"} sessions, S&amp;P 500 (SPY) vs Nifty 50. A tendency, not a forecast.{" "}
            <Link href="/study" className="text-crimson-300 hover:text-crimson-200">See the study</Link>
          </p>
        </div>
      )}
    </BentoCard>
  );
}
