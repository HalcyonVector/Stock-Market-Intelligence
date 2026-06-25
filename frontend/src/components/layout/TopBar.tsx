"use client";
import Link from "next/link";
import { Activity, Command } from "lucide-react";
import { useState } from "react";
import { CommandPalette } from "@/components/ui/CommandPalette";

export function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-base-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-crimson-grad shadow-glow">
            <Activity size={18} />
          </span>
          <span>
            <span className="text-lg font-bold tracking-tight text-white">Stock</span><span className="text-lg font-bold tracking-tight text-crimson-400">Intel</span>
          </span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-ink-300 transition hover:border-crimson-500/40"
        >
          <Command size={14} /> Search markets
          <kbd className="ml-2 rounded bg-black/40 px-1.5 text-xs">⌘K</kbd>
        </button>
      </div>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
