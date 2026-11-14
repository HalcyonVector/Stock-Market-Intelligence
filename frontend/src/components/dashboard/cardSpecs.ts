import { heightBySpan, type CardSpec } from "./layout";

/* Natural card heights (px), measured on the live site with real data at a
 * 1440px-wide window (a span of 4 is ~380px wide, 7 is ~690px). Lists use the
 * height of their usual row count; they scroll if their row is shorter. */
const spec = (id: string, w: number, kind: CardSpec["kind"], points: Record<number, number>, min?: number): CardSpec => ({
  id, w, kind, min, h: heightBySpan(points),
});

export const CARD_SPECS: Record<string, CardSpec> = {
  briefing: spec("briefing", 7, "text", { 4: 678, 5: 544, 6: 467, 7: 416, 8: 391, 12: 340 }, 6),
  feargreed: spec("feargreed", 5, "fixed", { 4: 302, 5: 288, 12: 288 }, 4),
  cues: spec("cues", 5, "fixed", { 4: 330, 5: 310, 12: 260 }, 4),
  movers: spec("movers", 4, "list", { 4: 547 }),
  radar: spec("radar", 4, "list", { 4: 576 }),
  news: spec("news", 4, "list", { 4: 645, 5: 595, 7: 579, 8: 546 }),
  sectors: spec("sectors", 4, "fixed", { 4: 467 }),
  analysts: spec("analysts", 4, "list", { 4: 486 }),
  economic: spec("economic", 4, "list", { 4: 544, 5: 528 }),
  earnings: spec("earnings", 4, "list", { 4: 520 }),
  sentiment: spec("sentiment", 4, "list", { 4: 625, 5: 609, 8: 593 }),
  livefeed: spec("livefeed", 4, "list", { 4: 482 }),
  insider: spec("insider", 4, "list", { 4: 626 }),
};
