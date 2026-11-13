"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { redeemTransferCode } from "@/lib/api";

/** Landing page for the QR code / link made by "Use on another device". */
function LinkDevice() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code") ?? "";
  const [state, setState] = useState<"ask" | "busy" | "error">("ask");
  const [error, setError] = useState("");

  useEffect(() => { if (!code) setState("error"); }, [code]);

  const go = async () => {
    setState("busy");
    try {
      await redeemTransferCode(code);
      try { localStorage.setItem("si_seen_landing", "1"); } catch { /* ignore */ }
      router.replace("/watchlists");
    } catch (e: any) {
      setError(e?.detail || e?.message || "That code didn't work.");
      setState("error");
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
      <h1 className="text-lg font-semibold">Link this device</h1>
      {state === "error" ? (
        <p className="mt-3 text-sm text-ink-400">{error || "This link has no code."} Make a new code on your other device.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-400">
            This browser will use the watchlists, alerts and paper account from the device that made code
            <span className="mx-1 font-mono text-ink-200">{code}</span>.
            Anything saved on this browser before stops showing here.
          </p>
          <button onClick={go} disabled={state === "busy"}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-crimson-600 px-5 py-2 text-sm font-medium text-white hover:bg-crimson-500 disabled:opacity-50">
            {state === "busy" && <Loader2 size={14} className="animate-spin" />} Link this device
          </button>
        </>
      )}
    </div>
  );
}

export default function LinkPage() {
  return <Suspense fallback={null}><LinkDevice /></Suspense>;
}
