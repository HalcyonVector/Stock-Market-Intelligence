"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useMarket } from "@/lib/market";
import { BentoCard } from "@/components/ui/BentoCard";

export function MarketBriefing() {
  const market = useMarket();
  const { data, isLoading, dataUpdatedAt, isError, refetch } = useQuery({
    queryKey: ["briefing", market],
    queryFn: () => api.briefing(market),
    // When the briefing is still pending (placeholder), poll faster (5s) so
    // the card updates as soon as the AI finishes generating.
    refetchInterval: (query) =>
      query.state.data?.pending ? 5_000 : 30_000,
  });

  // Phones show the first six lines; the rest is a tap away.
  const [full, setFull] = useState(false);
  const long = (data?.briefing?.length ?? 0) > 280;

  // Use the server's timestamp: the old code printed the browser's current
  // time, which looked fresh even when the briefing was hours old.
  const generatedAt =
    data?.briefing && data?.generated_at
      ? new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <BentoCard error={isError && !data} onRetry={() => refetch()} updatedAt={dataUpdatedAt}
      span="col-span-12 lg:col-span-7"
      title="AI Market Briefing"
      subtitle="Synthesised from movers, sectors and discovery scores"
      action={
        <motion.div
          animate={{
            boxShadow: [
              "0 0 8px rgba(255,59,92,0.3)",
              "0 0 20px rgba(255,59,92,0.6)",
              "0 0 8px rgba(255,59,92,0.3)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-full p-1.5 bg-crimson-500/10"
        >
          <Sparkles size={14} className="text-crimson-400" />
        </motion.div>
      }
    >
      <div className="relative flex flex-1 flex-col">
        {/* Left gradient border accent */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-gradient-to-b from-crimson-400 via-crimson-500/60 to-transparent" />

        <div className="flex flex-1 flex-col pl-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="h-4 animate-pulse rounded-lg bg-white/[0.04]"
                  style={{ width: `${100 - i * 15}%` }}
                />
              ))}
            </div>
          ) : data?.briefing ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className={cn("max-w-[72ch] text-sm font-light leading-relaxed text-ink-300 sm:text-[15px] sm:leading-[1.7]",
                !full && long && "max-lg:line-clamp-6")}>
                {data.briefing}
              </p>
              {long && (
                <button onClick={() => setFull((v) => !v)} aria-expanded={full}
                  className="mt-2 text-xs font-medium text-crimson-300 hover:text-crimson-200 lg:hidden">
                  {full ? "Show less" : "Read more"}
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 py-4"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles size={18} className="text-crimson-400" />
              </motion.div>
              <span className="text-sm text-ink-500 italic">
                AI is generating your market briefing...
              </span>
            </motion.div>
          )}

          {/* Generated at timestamp */}
          {generatedAt && !isLoading && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-auto pt-4 font-mono text-[11px] tracking-wide text-ink-500"
            >
              Generated at {generatedAt}
            </motion.p>
          )}
        </div>
      </div>
    </BentoCard>
  );
}
