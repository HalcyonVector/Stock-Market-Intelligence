"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warn" | "error";
type Toast = { id: number; title: string; body?: string; tone: Tone; href?: string };

// Tiny module-level store so any component can call toast() without a context.
let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function toast(title: string, opts: { body?: string; tone?: Tone; href?: string; ttl?: number } = {}) {
  const t: Toast = { id: nextId++, title, body: opts.body, tone: opts.tone ?? "info", href: opts.href };
  toasts = [...toasts, t].slice(-4);
  emit();
  setTimeout(() => dismiss(t.id), opts.ttl ?? 6000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const TONE: Record<Tone, string> = {
  info: "border-white/10",
  success: "border-emerald-500/40",
  warn: "border-amber-500/40",
  error: "border-crimson-500/50",
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence>
        {items.map((t) => {
          const content = (
            <>
              <p className="text-sm font-medium text-ink-100">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-ink-400">{t.body}</p>}
            </>
          );
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border bg-base-950/95 p-3 shadow-xl backdrop-blur",
                TONE[t.tone],
              )}
            >
              <div className="min-w-0 flex-1">
                {t.href ? <Link href={t.href} onClick={() => dismiss(t.id)}>{content}</Link> : content}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="text-ink-500 transition hover:text-ink-200"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
