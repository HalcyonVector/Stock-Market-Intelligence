/* Dashboard layout engine.
 *
 * People can show any combination of cards, so spans and heights can't be
 * hard-coded. Each card declares a preferred width (in twelfths), how tall its
 * content naturally is at a given width, and what kind of content it has:
 *
 *   fixed  a gauge or tile grid that must be shown whole. If its row is taller
 *          it is centred vertically, so the space looks intentional.
 *   text   prose (the AI briefing): shown whole; its height depends on width.
 *   list   rows that can scroll inside the card when the row is shorter.
 *
 * Cards are packed into rows of 12 in order; spare width in a row is shared
 * out, and a short last row is rebalanced by pulling a card down from the
 * row above. Each row's height comes from its contents so no card is
 * stretched far beyond what it holds:
 *   - only lists:      the shortest list's natural height (others scroll)
 *   - fixed/text too:  tall enough for every fixed/text card, and at least
 *                      LIST_MIN when lists share the row
 * Heights below were measured from the live site at a 1440px-wide window.
 */

export type Kind = "fixed" | "text" | "list";

export type CardSpec = {
  id: string;
  w: number;                       // preferred span out of 12 on large screens
  min?: number;                    // narrowest span it still looks right at (default w)
  kind: Kind;
  /** Natural height in px for a given span (content wraps less when wider). */
  h: (span: number) => number;
};

export type Placed = { spec: CardSpec; span: number };
export type Row = {
  cards: Placed[];
  height: number;     // expected height (exact for rows of only lists)
  minHeight: number;  // floor for rows that size to their gauge/grid/text
};

export const LIST_MIN = 460;       // lists sharing a row with a short fixed card
const ROW_MIN = 280;

/** Linear interpolation over measured (span -> height) points. */
export function heightBySpan(points: Record<number, number>): (span: number) => number {
  const xs = Object.keys(points).map(Number).sort((a, b) => a - b);
  return (span: number) => {
    if (span <= xs[0]) return points[xs[0]];
    if (span >= xs[xs.length - 1]) return points[xs[xs.length - 1]];
    for (let i = 1; i < xs.length; i++) {
      if (span <= xs[i]) {
        const [a, b] = [xs[i - 1], xs[i]];
        const t = (span - a) / (b - a);
        return Math.round(points[a] + t * (points[b] - points[a]));
      }
    }
    return points[xs[xs.length - 1]];
  };
}

const minOf = (s: CardSpec) => s.min ?? s.w;
const minSum = (row: CardSpec[]) => row.reduce((a, s) => a + minOf(s), 0);

function pack(specs: CardSpec[]): CardSpec[][] {
  const rows: CardSpec[][] = [];
  let cur: CardSpec[] = [];
  for (const s of specs) {
    // A card joins the row if everyone still fits at their minimum widths.
    if (cur.length && minSum(cur) + minOf(s) > 12) {
      rows.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) rows.push(cur);

  // Never leave a list alone on the last row (a list stretched across the
  // whole page looks empty). Pull a card down from the row above; a gauge or
  // the briefing left alone instead is fine, they lay out well full-width.
  for (let guard = 0; guard < 6 && rows.length > 1; guard++) {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const loneList = last.length === 1 && last[0].kind === "list";
    const uneven = last.length < prev.length - 1;
    if (!(loneList || uneven) || prev.length < 2) break;
    const moving = prev[prev.length - 1];
    if (minSum(last) + minOf(moving) > 12) break;
    prev.pop();
    last.unshift(moving);
  }
  return rows;
}

/** Widths for a row: everyone starts at their minimum, grows towards their
 *  preferred width, then any spare is shared in proportion. */
function spans(row: CardSpec[]): number[] {
  const base = row.map(minOf);
  let spare = 12 - base.reduce((a, b) => a + b, 0);
  // Grow towards preferred widths first, widest preference first.
  const byWant = row.map((s, i) => i).sort((a, b) => (row[b].w - base[b]) - (row[a].w - base[a]));
  for (const i of byWant) {
    const grow = Math.min(spare, row[i].w - base[i]);
    base[i] += grow;
    spare -= grow;
  }
  if (spare <= 0) return base;
  const total = base.reduce((a, b) => a + b, 0);
  const raw = base.map((w) => w + (spare * w) / total);
  const out = raw.map(Math.floor);
  let left = 12 - out.reduce((a, b) => a + b, 0);
  // Remaining columns go to the cards with the largest fractional parts.
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export function rowHeight(cards: Placed[]): number {
  const solid = cards.filter((c) => c.spec.kind !== "list").map((c) => c.spec.h(c.span));
  const lists = cards.filter((c) => c.spec.kind === "list").map((c) => c.spec.h(c.span));
  let h: number;
  if (!solid.length) h = Math.min(...lists);
  else if (!lists.length) h = Math.max(...solid);
  else h = Math.max(...solid, Math.min(LIST_MIN, ...lists));
  return Math.max(ROW_MIN, h);
}

export function layout(specs: CardSpec[]): Row[] {
  return pack(specs).map((row) => {
    const s = spans(row);
    const cards = row.map((spec, i) => ({ spec, span: s[i] }));
    const lists = cards.filter((c) => c.spec.kind === "list").map((c) => c.spec.h(c.span));
    const minHeight = lists.length ? Math.max(ROW_MIN, Math.min(LIST_MIN, ...lists)) : 0;
    return { cards, height: rowHeight(cards), minHeight };
  });
}

/** How much of a card's cell would be blank (px). Used by the layout tests. */
export function blankSpace(c: Placed, rowH: number): number {
  return Math.max(0, rowH - c.spec.h(c.span));
}
