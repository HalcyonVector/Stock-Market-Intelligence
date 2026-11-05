"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push";
import { toast } from "@/components/ui/Toaster";

/** Turn price-alert notifications on/off for this device (Web Push). */
export function PushCard() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["push-status"],
    queryFn: api.pushStatus,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "supported") currentSubscription().then((sub) => setSubscribed(!!sub)).catch(() => setSubscribed(false));
    else setSubscribed(false);
  }, []);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, { tone: "success" }); }
    catch (e: any) { toast("Couldn't change notifications", { body: e?.message, tone: "error" }); }
    finally {
      setBusy(false);
      setSubscribed(!!(await currentSubscription().catch(() => null)));
    }
  };

  if (isLoading || support === null) return null;

  let body: React.ReactNode;
  let action: React.ReactNode = null;
  if (!status?.enabled) {
    body = "Phone notifications aren't set up on this server yet. You'll still see triggered alerts here and as a pop-up while the site is open.";
  } else if (support === "needs-install") {
    body = <>On iPhone/iPad, notifications only work for installed sites: tap <b>Share → Add to Home Screen</b>, open StockIntel from your Home Screen, then turn them on here.</>;
  } else if (support === "unsupported") {
    body = "This browser can't receive web notifications. Try Chrome, Edge, Firefox or Safari on a recent version.";
  } else if (subscribed) {
    body = "On for this device. You'll get a notification when an alert fires, even with the site closed.";
    action = (
      <div className="flex gap-2">
        <button disabled={busy}
          onClick={() => run(async () => {
            const r = await api.pushTest();
            if (!r.sent) throw new Error("The notification service didn't accept the test. Try turning notifications off and on.");
          }, "Test notification sent")}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-ink-200 hover:bg-white/10 disabled:opacity-50">
          Send test
        </button>
        <button disabled={busy} onClick={() => run(disablePush, "Notifications turned off for this device")}
          className="rounded-lg px-3 py-1.5 text-xs text-ink-400 hover:text-ink-200 disabled:opacity-50">
          Turn off
        </button>
      </div>
    );
  } else {
    body = "Get a notification on this device when an alert fires, even when the site is closed. Free, no account or app needed.";
    action = (
      <button disabled={busy || !status.public_key}
        onClick={() => run(() => enablePush(status.public_key!), "Notifications are on for this device")}
        className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} Turn on
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
        <Smartphone size={18} />
      </span>
      <p className="flex-1 text-xs leading-relaxed text-ink-300">{body}</p>
      {action}
    </div>
  );
}
