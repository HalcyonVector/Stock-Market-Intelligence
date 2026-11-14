"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, Eye, EyeOff, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
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
import { EarningsCalendar } from "./EarningsCalendar";
import { GlobalCues } from "./GlobalCues";
import { CARD_SPECS } from "./cardSpecs";
import { layout } from "./layout";

const CARDS = [
  { id: "briefing", label: "AI Briefing", C: MarketBriefing },
  { id: "feargreed", label: "Fear & Greed", C: FearGreedGauge },
  { id: "cues", label: "Global Cues", C: GlobalCues },
  { id: "movers", label: "Market Movers", C: MoversList },
  { id: "radar", label: "Opportunity Radar", C: OpportunityRadar },
  { id: "news", label: "News", C: NewsCarousel },
  { id: "sectors", label: "Sector Rotation", C: SectorHeatmap },
  { id: "analysts", label: "Analyst Consensus", C: TopAnalystsPicks },
  { id: "economic", label: "Economic Calendar", C: EconomicCalendar },
  { id: "earnings", label: "Upcoming Earnings", C: EarningsCalendar },
  { id: "sentiment", label: "Retail Sentiment", C: SentimentTrends },
  { id: "livefeed", label: "Unusual Activity", C: LiveFeed },
  { id: "insider", label: "Insider Activity", C: InsiderActivity },
] as const;

type CardId = (typeof CARDS)[number]["id"];

// A calmer default: the eight cards most people use. Everything else is one
// click away under Customize.
export const DEFAULT_SHOWN: CardId[] = ["briefing", "feargreed", "cues", "movers", "news", "sectors", "analysts", "economic"];

const SHOWN_KEY = "si_dashboard_cards";
const LEGACY_HIDDEN_KEY = "si_hidden_cards";

function loadShown(): Set<CardId> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (raw) return new Set(JSON.parse(raw));
    // Someone who customised the old dashboard keeps their choice.
    const legacy = localStorage.getItem(LEGACY_HIDDEN_KEY);
    if (legacy) {
      const hidden = new Set<string>(JSON.parse(legacy));
      return new Set(CARDS.map((c) => c.id).filter((id) => !hidden.has(id) && id !== "cues" && id !== "earnings"));
    }
  } catch { /* ignore */ }
  return new Set(DEFAULT_SHOWN);
}

// Tailwind only ships classes it can see in the source, so spans are spelled out.
const SPAN: Record<number, string> = {
  1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4",
  5: "lg:col-span-5", 6: "lg:col-span-6", 7: "lg:col-span-7", 8: "lg:col-span-8",
  9: "lg:col-span-9", 10: "lg:col-span-10", 11: "lg:col-span-11", 12: "lg:col-span-12",
};

/** A dashboard cell. Below lg, a list card folds to about half a screen and
 *  offers "Show all" when its content is longer than that. */
function FoldCell({ id, span, foldable, className, children }: {
  id: string; span: number; foldable: boolean; className: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const cell = ref.current;
    if (!foldable || !cell) return;
    const check = () => {
      const body = cell.querySelector<HTMLElement>(":scope > section > div:last-child");
      setOverflows(!!body && body.scrollHeight > body.clientHeight + 8);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(cell);
    const mo = new MutationObserver(check);
    mo.observe(cell, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [foldable, open]);

  const folded = foldable && !open;
  return (
    <div ref={ref} data-card={id} data-span={span} className={cn(className, "relative", folded && "dash-fold", open && "max-lg:[&>section]:pb-14")}>
      {children}
      {foldable && (overflows || open) && (
        <button
          onClick={() => {
            setOpen((v) => !v);
            if (open) ref.current?.scrollIntoView({ block: "nearest" });
          }}
          aria-expanded={open}
          className="absolute inset-x-4 bottom-3 flex items-center justify-center gap-1 rounded-lg bg-base-950/80 py-2 text-xs font-medium text-ink-300 backdrop-blur hover:text-ink-100 lg:hidden"
        >
          {open ? <>Show less <ChevronUp size={14} /></> : <>Show all <ChevronDown size={14} /></>}
        </button>
      )}
    </div>
  );
}

export function Dashboard() {
  const [shown, setShown] = useState<Set<CardId>>(new Set(DEFAULT_SHOWN));
  const [editing, setEditing] = useState(false);

  useEffect(() => { setShown(loadShown()); }, []);

  const update = (next: Set<CardId>) => {
    setShown(next);
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  };
  const toggle = (id: CardId) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };
  const isDefault = shown.size === DEFAULT_SHOWN.length && DEFAULT_SHOWN.every((id) => shown.has(id));

  const rows = useMemo(() => layout(CARDS.filter((c) => shown.has(c.id)).map((c) => CARD_SPECS[c.id])), [shown]);
  const byId = Object.fromEntries(CARDS.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <MarketOverview />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-500">
          Free data sources · quotes delayed ~15 min<span className="hidden sm:inline"> · cards refresh every 2 min</span>
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
                const on = shown.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggle(id)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      on ? "border-crimson-500/30 bg-crimson-600/10 text-ink-100" : "border-white/10 text-ink-500 hover:text-ink-300"
                    )}
                  >
                    {on ? <Eye size={12} /> : <EyeOff size={12} />} {label}
                  </button>
                );
              })}
              {!isDefault && (
                <button onClick={() => update(new Set(DEFAULT_SHOWN))}
                  className="ml-auto flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300">
                  <RotateCcw size={12} /> Reset to default
                </button>
              )}
              <p className="w-full text-[10px] text-ink-500">The layout rearranges itself for whatever you pick. Hidden cards stop loading data.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {shown.size === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-ink-500">
          All cards are hidden. Open Customize to pick some.
        </p>
      )}

      {/* One grid per row: each row gets a height that suits what's in it. On
          small screens cards stack at their natural height. Hidden cards
          aren't mounted, so they also stop polling the API. */}
      <div className="space-y-4">
        {rows.map((row, ri) => {
          // Rows with a gauge, grid or the briefing grow to fit those exactly
          // (their content varies, e.g. the briefing's length); lists in the
          // row take that height and scroll. Rows of only lists get a set
          // height from their measured contents.
          const solid = row.cards.some((c) => c.spec.kind !== "list");
          return (
            <div
              key={ri}
              data-row-height={row.height}
              style={{ "--row-h": `${row.height}px`, "--row-min": `${row.minHeight}px` } as React.CSSProperties}
              className={cn("grid grid-cols-12 gap-4", solid ? "dash-row-auto" : "dash-row-fixed")}
            >
              {row.cards.map(({ spec, span }) => {
                const { C } = byId[spec.id];
                return (
                  <FoldCell
                    key={spec.id}
                    id={spec.id}
                    span={span}
                    foldable={spec.kind === "list"}
                    className={cn(
                      "dash-cell col-span-12 min-w-0", SPAN[span],
                      spec.kind === "list" && "dash-scroll",
                      spec.kind === "list" && solid && "dash-contain",
                      spec.kind === "fixed" && "dash-center",
                    )}
                  >
                    <C />
                  </FoldCell>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
