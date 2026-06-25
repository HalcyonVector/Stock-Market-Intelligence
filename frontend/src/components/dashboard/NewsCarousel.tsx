"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Newspaper, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";
import { cn } from "@/lib/utils";

const PER_PAGE = 6;

export function NewsCarousel() {
  const { data } = useQuery({ queryKey: ["news"], queryFn: () => api.news(30) });
  const items = data ?? [];
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const visible = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <BentoCard
      span="col-span-12 lg:col-span-4"
      title="Market News"
      icon={<Newspaper size={14} className="text-crimson-400" />}
      action={
        items.length > PER_PAGE ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-ink-500 tabular-nums">
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                page === 0
                  ? "border-white/5 text-ink-500/30 cursor-not-allowed"
                  : "border-white/10 text-ink-300 hover:border-crimson-500/30 hover:text-crimson-300"
              )}
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                page >= totalPages - 1
                  ? "border-white/5 text-ink-500/30 cursor-not-allowed"
                  : "border-white/10 text-ink-300 hover:border-crimson-500/30 hover:text-crimson-300"
              )}
            >
              <ChevronRight size={12} />
            </button>
          </div>
        ) : null
      }
    >
      {visible.length === 0 ? (
        <p className="text-xs text-ink-500 py-4 text-center">Loading news feed...</p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-0.5"
          >
            {visible.map((item: any, i: number) => (
              <div key={`${item.url}-${i}`}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.04]"
                >
                  {/* Number badge */}
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-ink-500/20 text-[10px] font-semibold text-ink-500 group-hover:border-crimson-400/40 group-hover:text-crimson-300 transition-colors tabular-nums">
                    {page * PER_PAGE + i + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-[12px] font-medium leading-snug text-ink-100 transition-colors group-hover:text-crimson-300 line-clamp-2">
                      {item.headline}
                      <ExternalLink
                        size={10}
                        className="ml-1 inline-block -translate-y-px opacity-0 transition-opacity group-hover:opacity-70"
                      />
                    </h4>
                    {item.summary && (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-500 line-clamp-1">
                        {item.summary}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[9px] text-ink-500">
                      <span className="font-medium">{item.source}</span>
                      <span className="text-ink-500/30">|</span>
                      <span>{new Date(item.published_at).toLocaleDateString()}</span>
                      {item.symbol && (
                        <>
                          <span className="text-ink-500/30">|</span>
                          <span className="rounded border border-crimson-500/20 bg-crimson-500/10 px-1 py-px font-mono text-[9px] font-medium text-crimson-300">
                            {item.symbol}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </a>

                {/* Separator */}
                {i < visible.length - 1 && (
                  <div className="mx-2 border-b border-white/[0.04]" />
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </BentoCard>
  );
}
