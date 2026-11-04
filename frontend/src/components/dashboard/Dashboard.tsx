"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketOverview } from "./MarketOverview";
import { MarketBriefing } from "./MarketBriefing";
import { FearGreedGauge } from "./FearGreedGauge";
import { MoversList } from "./MoversList";
import { OpportunityRadar } from "./OpportunityRadar";
import { SectorHeatmap } from "./SectorHeatmap";
import { SentimentTrends } from "./SentimentTrends";
import { LiveFeed } from "./LiveFeed";
import { NewsCarousel } from "./NewsCarousel";
import { TopAnalystsPicks } from "./TopAnalystsPicks";
import { EconomicCalendar } from "./EconomicCalendar";
import { InsiderActivity } from "./InsiderActivity";

const CARDS = [
  { id: "briefing", label: "AI Briefing", C: MarketBriefing },
  { id: "feargreed", label: "Fear & Greed", C: FearGreedGauge },
  { id: "movers", label: "Market Movers", C: MoversList },
  { id: "radar", label: "Opportunity Radar", C: OpportunityRadar },
  { id: "news", label: "News", C: NewsCarousel },
  { id: "sectors", label: "Sector Rotation", C: SectorHeatmap },
  { id: "sentiment", label: "Retail Sentiment", C: SentimentTrends },
  { id: "livefeed", label: "Live Feed", C: LiveFeed },
  { id: "analysts", label: "Top Analyst Picks", C: TopAnalystsPicks },
  { id: "economic", label: "Economic Calendar", C: EconomicCalendar },
  { id: "insider", label: "Insider Activity", C: InsiderActivity },
] as const;

const HIDDEN_KEY = "si_hidden_cards";

export function Dashboard() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try { setHidden(new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"))); } catch { /* ignore */ }
  }, []);

  const update = (next: Set<string>) => {
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  };
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };

  return (
    <div className="space-y-4">
      <MarketOverview />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-500">
          Free data sources · quotes delayed ~15 min · cards refresh every 2 min
        </p>
        <button
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-white/10"
        >
          <SlidersHorizontal size={13} /> Customize
        </button>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass flex flex-wrap items-center gap-2 p-3">
              {CARDS.map(({ id, label }) => {
                const shown = !hidden.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle(id)}
                    aria-pressed={shown}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      shown
                        ? "border-crimson-500/30 bg-crimson-600/10 text-ink-100"
                        : "border-white/10 text-ink-500 hover:text-ink-300"
                    )}
                  >
                    {shown ? <Eye size={12} /> : <EyeOff size={12} />} {label}
                  </button>
                );
              })}
              {hidden.size > 0 && (
                <button
                  onClick={() => update(new Set())}
                  className="ml-auto flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300"
                >
                  <RotateCcw size={12} /> Show all
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden cards aren't mounted, so they also stop polling the API. */}
      <div className="bento">
        {CARDS.filter(({ id }) => !hidden.has(id)).map(({ id, C }) => <C key={id} />)}
      </div>
    </div>
  );
}
