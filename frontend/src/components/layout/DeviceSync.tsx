"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Smartphone, X } from "lucide-react";
import { api, redeemTransferCode } from "@/lib/api";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

/** Use the same watchlists, alerts and paper account on another device, with
 *  no account: one device shows a 10-minute one-time code, the other enters it. */
export function DeviceSyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"share" | "enter">("share");
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [expires, setExpires] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setCode(null); setQr(null); setInput(""); setMode("share"); }
  }, [open]);
  useEffect(() => {
    if (!expires) return;
    const id = setInterval(() => setExpires((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [expires]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;
  const link = code ? `${window.location.origin}/link?code=${code}` : "";

  const makeCode = async () => {
    setBusy(true);
    try {
      const r = await api.transferCode();
      setCode(r.code);
      setExpires(r.expires_in);
      const QR = await import("qrcode");
      setQr(await QR.toDataURL(`${window.location.origin}/link?code=${r.code}`, { margin: 1, width: 180 }));
    } catch (e: any) {
      toast("Couldn't make a code", { body: e?.message, tone: "error" });
    } finally { setBusy(false); }
  };

  const redeem = async () => {
    setBusy(true);
    try {
      await redeemTransferCode(input);
      qc.invalidateQueries();
      toast("This device is now linked", { body: "Your watchlists, alerts and paper account are here.", tone: "success" });
      onClose();
    } catch (e: any) {
      toast("Couldn't link this device", { body: e?.detail || e?.message, tone: "error" });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Use on another device" className="glass w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Smartphone size={18} /> Use on another device</h2>
            <p className="mt-1 text-xs text-ink-400">Your watchlists, alerts and paper account belong to this browser. Link another device to share them. No account needed.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:text-ink-200"><X size={16} /></button>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
          {(["share", "enter"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("flex-1 rounded-md py-1.5", mode === m ? "bg-white/10 text-ink-100" : "text-ink-400")}>
              {m === "share" ? "Show a code (this device)" : "Enter a code (new device)"}
            </button>
          ))}
        </div>

        {mode === "share" ? (
          code && expires > 0 ? (
            <div className="space-y-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing to optimise */}
              {qr && <img src={qr} alt="QR code that opens the link on another device" className="mx-auto rounded-lg bg-white p-1" width={180} height={180} />}
              <p className="font-mono text-2xl font-bold tracking-widest">{code}</p>
              <p className="text-[11px] text-ink-500">
                Scan the QR code, or open StockIntel on the other device and enter the code.
                Works once, for {Math.floor(expires / 60)}:{String(expires % 60).padStart(2, "0")} more.
              </p>
              <button onClick={() => { navigator.clipboard?.writeText(link); toast("Link copied", { tone: "success" }); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 hover:bg-white/5">
                <Copy size={12} /> Copy link
              </button>
            </div>
          ) : (
            <button onClick={makeCode} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-crimson-600 py-2 text-sm font-medium text-white hover:bg-crimson-500 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} {code ? "Make a new code" : "Make a code"}
            </button>
          )
        ) : (
          <div className="space-y-3">
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} maxLength={9}
              onKeyDown={(e) => e.key === "Enter" && input.trim() && redeem()}
              placeholder="ABCD-1234" aria-label="Code from your other device" autoFocus
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-crimson-500/40" />
            <p className="text-[11px] text-ink-500">
              This device will switch to the other device&apos;s data. Anything you saved on this browser before stops showing here.
            </p>
            <button onClick={redeem} disabled={busy || input.replace(/[^A-Z0-9]/g, "").length !== 8}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-crimson-600 py-2 text-sm font-medium text-white hover:bg-crimson-500 disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Link this device
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
