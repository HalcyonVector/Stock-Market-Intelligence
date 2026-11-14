import { test, expect } from "@playwright/test";
import { layout, blankSpace } from "../src/components/dashboard/layout";
import { CARD_SPECS } from "../src/components/dashboard/cardSpecs";

// Checks the layout engine against EVERY combination of dashboard cards
// (8,191 of them): pure maths, no browser needed.
const ORDER = ["briefing", "feargreed", "cues", "movers", "radar", "news", "sectors",
  "analysts", "economic", "earnings", "sentiment", "livefeed", "insider"];

test("every card combination lays out cleanly", () => {
  const problems: string[] = [];
  for (let m = 1; m < 1 << ORDER.length; m++) {
    const ids = ORDER.filter((_, i) => m & (1 << i));
    const rows = layout(ids.map((id) => CARD_SPECS[id]));
    for (const r of rows) {
      const where = `[${ids.join(",")}] row ${r.cards.map((c) => `${c.spec.id}:${c.span}`).join(" ")}`;
      const sum = r.cards.reduce((a, c) => a + c.span, 0);
      if (sum !== 12) problems.push(`${where}: spans add to ${sum}`);
      for (const c of r.cards) {
        if (c.span < (c.spec.min ?? c.spec.w)) problems.push(`${where}: ${c.spec.id} narrower than its minimum`);
        if (c.spec.kind !== "list" && c.spec.h(c.span) > r.height + 1) problems.push(`${where}: ${c.spec.id} cut off`);
        // Fixed cards are centred, so their blank space is split top and bottom.
        const blank = blankSpace(c, r.height) / (c.spec.kind === "fixed" ? 2 : 1);
        if (blank > 120) problems.push(`${where}: ${c.spec.id} has ${Math.round(blank)}px blank`);
        if (c.spec.kind === "list" && c.span > 8 && ids.length > 1) problems.push(`${where}: list ${c.spec.id} stretched to ${c.span}/12`);
      }
      if (r.cards.length === 1 && r.cards[0].spec.kind === "list" && ids.length > 1) problems.push(`${where}: lone list row`);
    }
  }
  expect(problems.slice(0, 10)).toEqual([]);
});

test("the default dashboard is three tidy rows", () => {
  const rows = layout(["briefing", "feargreed", "cues", "movers", "news", "sectors", "analysts", "economic"].map((id) => CARD_SPECS[id]));
  expect(rows.map((r) => r.cards.map((c) => `${c.spec.id}:${c.span}`))).toEqual([
    ["briefing:7", "feargreed:5"],
    ["cues:4", "movers:4", "news:4"],
    ["sectors:4", "analysts:4", "economic:4"],
  ]);
});
