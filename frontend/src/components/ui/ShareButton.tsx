"use client";
import { Link2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

/** Copies the current URL (which carries the page's state) to the clipboard. */
export function ShareButton({ className }: { className?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied", { body: "Anyone with the link sees this same setup.", tone: "success", ttl: 3000 });
    } catch {
      toast("Couldn't copy the link", { tone: "error" });
    }
  };
  return (
    <button
      onClick={copy}
      aria-label="Copy a shareable link to this view"
      className={
        className ??
        "flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-white/10"
      }
    >
      <Link2 size={14} /> Share
    </button>
  );
}
