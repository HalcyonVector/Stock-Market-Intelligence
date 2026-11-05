"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Loader2, WifiOff } from "lucide-react";

type State = "ok" | "waking" | "down";
type Sample = null | "demo" | "fallback";

/**
 * The free Render backend sleeps when idle and takes 30-60 s to boot. Instead
 * of a wall of empty skeleton cards, tell the visitor what's happening.
 * One cheap /health ping per page load; the banner only appears if it's slow.
 */
export function ServerStatus() {
  const [state, setState] = useState<State>("ok");
  // Whether the API recently had to serve sample (mock) data. /health reports
  // it from in-process counters, so checking costs no Redis/API quota.
  const [sample, setSample] = useState<Sample>(null);

  useEffect(() => {
    let cancelled = false;
    let slowTimer: ReturnType<typeof setTimeout>;

    const ping = async (attempt: number): Promise<void> => {
      const ctrl = new AbortController();
      const abort = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const res = await fetch("/backend-health", { cache: "no-store", signal: ctrl.signal });
        // Any non-5xx answer means something is awake and responding; a
        // sleeping Render instance shows up as a slow request or a 502/503.
        if (res.status >= 500) throw new Error(String(res.status));
        if (!cancelled) setState("ok");
        try {
          const h = await res.json();
          if (!cancelled) {
            setSample(h?.data_mode === "mock" ? "demo" : h?.market?.mock_recent ? "fallback" : null);
          }
        } catch { /* older backend: no sample info */ }
      } catch {
        if (cancelled) return;
        if (attempt >= 6) { setState("down"); return; }
        setState("waking");
        await new Promise((r) => setTimeout(r, 5_000));
        return ping(attempt + 1);
      } finally {
        clearTimeout(abort);
      }
    };

    // Only show the banner if the first ping is slow.
    slowTimer = setTimeout(() => { if (!cancelled) setState((s) => (s === "ok" ? "waking" : s)); }, 3_000);
    ping(0).finally(() => clearTimeout(slowTimer));
    // Re-check the sample-data flag now and then while the tab is open.
    const recheck = setInterval(() => { if (!document.hidden) ping(6); }, 10 * 60_000);
    return () => { cancelled = true; clearTimeout(slowTimer); clearInterval(recheck); };
  }, []);

  return (
    <AnimatePresence>
      {state === "ok" && sample && (
        <motion.div
          key="sample"
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-sky-500/20 bg-sky-500/10"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-center text-[11px] text-sky-200">
            <FlaskConical size={13} aria-hidden className="shrink-0" />
            {sample === "demo"
              ? "Demo mode: all prices and news are sample data."
              : "Some prices are sample data right now (live sources didn't answer). Items marked “Sample” aren't real."}
          </div>
        </motion.div>
      )}
      {state !== "ok" && (
        <motion.div
          key="server"
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-amber-500/20 bg-amber-500/10"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-amber-200">
            {state === "waking" ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Waking up the server — free hosting sleeps when idle, so this can take up to a minute.
              </>
            ) : (
              <>
                <WifiOff size={14} aria-hidden />
                The server isn&apos;t responding right now. Data shown may be missing or out of date.
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
