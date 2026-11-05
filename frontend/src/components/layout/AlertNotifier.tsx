"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, hasIdentity } from "@/lib/api";
import { toast } from "@/components/ui/Toaster";

const SEEN_KEY = "si_notified_alerts";

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function writeSeen(ids: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200))); } catch { /* ignore */ }
}

function describe(a: any): string {
  const price = a.trigger_price != null ? ` at ${Number(a.trigger_price).toFixed(2)}` : "";
  switch (a.condition) {
    case "above": return `${a.symbol} rose above ${a.threshold}${price}`;
    case "below": return `${a.symbol} fell below ${a.threshold}${price}`;
    case "change_pct_above": return `${a.symbol} is up ${a.threshold}%+ today${price}`;
    case "change_pct_below": return `${a.symbol} is down past ${a.threshold}% today${price}`;
    default: return `${a.symbol} alert triggered`;
  }
}

/**
 * Watches this browser's alerts (the server checks them every refresh cycle)
 * and surfaces newly-triggered ones as an in-app toast plus a system
 * notification when the user has granted permission. Only runs for browsers
 * that already have an identity, so first-time visitors cost nothing.
 */
export function AlertNotifier() {
  const enabled = hasIdentity();
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    enabled,
    refetchInterval: 5 * 60 * 1000,
  });

  // With Web Push on, the server already sent a system notification for each
  // fired alert; don't show a second one from this tab.
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    navigator.serviceWorker?.getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setPushOn(!!sub))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!alerts?.length) return;
    const seen = readSeen();
    let changed = false;
    for (const a of alerts) {
      if (!a.triggered || seen.has(a.id)) continue;
      seen.add(a.id);
      changed = true;
      const body = describe(a) + (a.note ? ` — ${a.note}` : "");
      toast("Price alert triggered", { body, tone: "warn", href: `/stock/${a.symbol}`, ttl: 12000 });
      try {
        if (!pushOn && "Notification" in window && Notification.permission === "granted") {
          new Notification("StockIntel price alert", { body, tag: `alert-${a.id}` });
        }
      } catch { /* some mobile browsers throw on the constructor */ }
    }
    if (changed) writeSeen(seen);
  }, [alerts, pushOn]);

  return null;
}
