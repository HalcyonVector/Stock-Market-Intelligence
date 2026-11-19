"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { SlidersHorizontal, Eye, EyeOff, RotateCcw, ChevronDown, ChevronUp, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
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
const ORDER_KEY = "si_dashboard_order";
const DEFAULT_ORDER: CardId[] = CARDS.map((c) => c.id);

/** Saved order, with any card added since appended in its default place. */
function loadOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (raw) {
      const known = new Set<string>(DEFAULT_ORDER);
      const saved = (JSON.parse(raw) as string[]).filter((id): id is CardId => known.has(id));
      return [...saved, ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
    }
  } catch { /* ignore */ }
  return DEFAULT_ORDER;
}
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

/** One card in the Customize list: drag the grip (mouse or touch), or use the
 *  arrow buttons, to move it; the eye shows or hides it. */
function OrderItem({ id, label, on, first, last, onToggle, onMove }: {
  id: CardId; label: string; on: boolean; first: boolean; last: boolean;
  onToggle: () => void; onMove: (d: -1 | 1) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls}
      className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs",
        on ? "border-crimson-500/30 bg-crimson-600/10 text-ink-100" : "border-white/10 bg-base-950/60 text-ink-500")}>
      <button onPointerDown={(e) => controls.start(e)} aria-label={`Drag ${label}`}
        className="cursor-grab touch-none p-1 text-ink-500 hover:text-ink-300 active:cursor-grabbing">
        <GripVertical size={14} />
      </button>
      <span className="flex-1 truncate">{label}</span>
      <button onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${label} up`}
        className="rounded p-1 text-ink-500 hover:text-ink-200 disabled:opacity-30"><ArrowUp size={13} /></button>
      <button onClick={() => onMove(1)} disabled={last} aria-label={`Move ${label} down`}
        className="rounded p-1 text-ink-500 hover:text-ink-200 disabled:opacity-30"><ArrowDown size={13} /></button>
      <button onClick={onToggle} aria-pressed={on} aria-label={on ? `Hide ${label}` : `Show ${label}`}
        className="rounded p-1 hover:text-ink-200">{on ? <Eye size={13} /> : <EyeOff size={13} />}</button>
    </Reorder.Item>
  );
}

export function Dashboard() {
  const [shown, setShown] = useState<Set<CardId>>(new Set(DEFAULT_SHOWN));
  const [order, setOrder] = useState<CardId[]>(DEFAULT_ORDER);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setShown(loadShown()); setOrder(loadOrder()); }, []);

  const saveOrder = (next: CardId[]) => {
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const move = (id: CardId, d: -1 | 1) => {
    const i = order.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };

  const update = (next: Set<CardId>) => {
    setShown(next);
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  };
  const toggle = (id: CardId) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };
  const isDefault = shown.size === DEFAULT_SHOWN.length && DEFAULT_SHOWN.every((id) => shown.has(id))
    && order.every((id, i) => id === DEFAULT_ORDER[i]);

  const rows = useMemo(() => layout(order.filter((id) => shown.has(id)).map((id) => CARD_SPECS[id])), [shown, order]);
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
            <div className="glass space-y-2 p-3">
              <Reorder.Group axis="y" values={order} onReorder={saveOrder} className="grid gap-1.5 sm:max-w-md">
                {order.map((id, i) => (
                  <OrderItem key={id} id={id} label={byId[id].label} on={shown.has(id)}
                    first={i === 0} last={i === order.length - 1}
                    onToggle={() => toggle(id)} onMove={(d) => move(id, d)} />
                ))}
              </Reorder.Group>
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-[10px] text-ink-500">
                  Drag a card by its grip, or use the arrows, to change the order. The layout rearranges itself for whatever you pick. Hidden cards stop loading data.
                </p>
                {!isDefault && (
                  <button onClick={() => { update(new Set(DEFAULT_SHOWN)); saveOrder(DEFAULT_ORDER); }}
                    className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300">
                    <RotateCcw size={12} /> Reset to default
                  </button>
                )}
              </div>
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
