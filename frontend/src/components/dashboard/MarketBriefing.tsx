"use client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { BentoCard } from "@/components/ui/BentoCard";

export function MarketBriefing() {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing"],
    queryFn: () => api.briefing(),
    // When the briefing is still pending (placeholder), poll faster (5s) so
    // the card updates as soon as the AI finishes generating.
    refetchInterval: (query) =>
      query.state.data?.pending ? 5_000 : 30_000,
  });

  const generatedAt = data?.briefing
    ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <BentoCard
      span="col-span-12 lg:col-span-6"
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
      <div className="relative">
        {/* Left gradient border accent */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-gradient-to-b from-crimson-400 via-crimson-500/60 to-transparent" />

        <div className="pl-5">
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
              <p className="text-[15px] leading-[1.75] text-ink-300 font-light">
                {data.briefing}
              </p>
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
              className="mt-4 text-[11px] text-ink-500/60 font-mono tracking-wide"
            >
              Generated at {generatedAt}
            </motion.p>
          )}
        </div>
      </div>
    </BentoCard>
  );
}
