"use client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";

export function NewsCarousel() {
  const { data } = useQuery({ queryKey: ["news"], queryFn: () => api.news(12) });
  const [idx, setIdx] = useState(0);
  const items = data ?? [];

  // Auto-advance every 6s
  useEffect(() => {
    if (items.length === 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);

  const current = items[idx];

  return (
    <BentoCard
      span="col-span-12 lg:col-span-5"
      title="Market News"
      action={
        items.length > 0 ? (
          <div className="flex items-center gap-1">
            <button onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
              className="rounded p-1 hover:bg-white/5">
              <ChevronLeft size={14} className="text-ink-500" />
            </button>
            <span className="text-[10px] text-ink-500">{idx + 1}/{items.length}</span>
            <button onClick={() => setIdx((i) => (i + 1) % items.length)}
              className="rounded p-1 hover:bg-white/5">
              <ChevronRight size={14} className="text-ink-500" />
            </button>
          </div>
        ) : null
      }
    >
      <div className="relative min-h-[80px]">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <h4 className="text-sm font-medium text-ink-100 group-hover:text-crimson-300 transition">
                  {current.headline}
                  <ExternalLink size={12} className="ml-1 inline opacity-0 group-hover:opacity-100 transition" />
                </h4>
                {current.summary && (
                  <p className="mt-1 text-xs text-ink-500 line-clamp-2">{current.summary}</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-ink-500">
                  <span>{current.source}</span>
                  {current.symbol && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-crimson-300">
                      {current.symbol}
                    </span>
                  )}
                  <span>{new Date(current.published_at).toLocaleDateString()}</span>
                </div>
              </a>
            </motion.div>
          ) : (
            <p className="text-xs text-ink-500">Loading news feed…</p>
          )}
        </AnimatePresence>
      </div>
    </BentoCard>
  );
}
