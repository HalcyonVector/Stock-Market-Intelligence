/* Parse a broker holdings export (Zerodha Kite/Console, Upstox, Groww, IBKR,
 * Robinhood-style or any CSV with ticker / quantity / average-cost columns).
 * Runs in the browser: the file is never uploaded. */

export type ParsedHolding = { symbol: string; quantity: number; avg_cost: number };
export type ParseResult = { holdings: ParsedHolding[]; warnings: string[] };

const SYMBOL_COLS = ["instrument", "symbol", "tradingsymbol", "trading symbol", "ticker", "scrip", "stock symbol", "scrip code", "security"];
const NAME_ONLY_COLS = ["stock name", "company name", "name", "company"];
const QTY_COLS = ["qty", "qty.", "quantity", "shares", "units", "quantity available", "net qty", "holding qty"];
const AVG_COLS = ["avg. cost", "avg cost", "average cost", "avg price", "average price", "average buy price", "buy avg", "avg. price", "cost basis per share", "avg buy price"];

/** Minimal RFC-4180 CSV split: handles quotes, escaped quotes and commas in quotes. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();
const num = (v: string) => {
  const n = Number(v.replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

function findCol(header: string[], names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return h.findIndex((x) => names.some((n) => x.startsWith(n)));
}

export function parseHoldingsCsv(text: string): ParseResult {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  const warnings: string[] = [];
  // Some exports start with a few lines of account info before the table.
  const headerIdx = rows.findIndex((r) => findCol(r, SYMBOL_COLS) >= 0 && findCol(r, QTY_COLS) >= 0);
  if (headerIdx < 0) {
    const nameOnly = rows.some((r) => findCol(r, NAME_ONLY_COLS) >= 0 && findCol(r, QTY_COLS) >= 0);
    return {
      holdings: [],
      warnings: [nameOnly
        ? "This file lists company names but no ticker symbols. Export a holdings file that includes the symbol (e.g. Zerodha Console or Kite holdings), or add a 'Symbol' column."
        : "Couldn't find symbol and quantity columns. The file needs a header row with something like Symbol/Instrument, Quantity and Average cost."],
    };
  }
  const header = rows[headerIdx];
  const si = findCol(header, SYMBOL_COLS);
  const qi = findCol(header, QTY_COLS);
  const ai = findCol(header, AVG_COLS);
  if (ai < 0) warnings.push("No average-cost column found, so profit/loss can't be worked out.");

  const holdings: ParsedHolding[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const symbol = (r[si] ?? "").toUpperCase();
    const quantity = num(r[qi] ?? "");
    const avg = ai >= 0 ? num(r[ai] ?? "") : 0;
    if (!symbol || /^(TOTAL|GRAND TOTAL)/.test(symbol)) continue;
    if (!(quantity > 0)) { skipped++; continue; }
    holdings.push({ symbol, quantity, avg_cost: Number.isFinite(avg) ? avg : 0 });
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped > 1 ? "s" : ""} with no quantity.`);
  if (holdings.length > 60) {
    warnings.push("Only the first 60 holdings are analysed.");
    holdings.length = 60;
  }
  return { holdings, warnings };
}
