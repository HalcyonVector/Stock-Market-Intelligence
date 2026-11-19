/* Mutual fund transactions: parse a transaction file and work out XIRR.
 * Runs in the browser; the file is never uploaded. */
import { splitCsv } from "./holdingsCsv";

export type FundTxn = {
  date: string;          // YYYY-MM-DD
  scheme: string;        // scheme name as written in the file
  code?: number;         // AMFI scheme code, when the file has one
  amount: number;        // rupees, always positive
  units: number;         // always positive
  kind: "buy" | "sell";
};
export type TxnParse = { txns: FundTxn[]; warnings: string[] };

const DATE_COLS = ["date", "transaction date", "trade date", "txn date", "nav date"];
const SCHEME_COLS = ["scheme name", "scheme", "fund name", "fund", "scheme / fund name", "security name", "name"];
const CODE_COLS = ["amfi code", "scheme code", "amfi"];
const AMOUNT_COLS = ["amount", "amount (inr)", "amount (rs)", "value", "transaction amount", "invested amount"];
const UNITS_COLS = ["units", "unit", "quantity", "qty", "allotted units"];
const TYPE_COLS = ["type", "transaction type", "txn type", "transaction", "description", "side"];

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();
const num = (v: string) => {
  const s = v.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
function col(header: string[], names: string[]): number {
  const h = header.map(norm);
  for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; }
  return h.findIndex((x) => names.some((n) => x.startsWith(n)));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** Accepts 2024-03-05, 05-03-2024, 05/03/2024 (day first, as Indian files are) and 05-Mar-2024. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{4})$/))) { d = +r[1]; m = MONTHS[r[2].toLowerCase()]; y = +r[3]; }
  else return null;
  if (!m || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SELL = /redeem|redemption|sell|sold|switch[- ]?out|withdraw|swp/i;

export function parseFundTxns(text: string): TxnParse {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  const headerIdx = rows.findIndex((r) => col(r, DATE_COLS) >= 0 && col(r, AMOUNT_COLS) >= 0 && (col(r, SCHEME_COLS) >= 0 || col(r, CODE_COLS) >= 0));
  if (headerIdx < 0) {
    return { txns: [], warnings: ["Couldn't find the columns. The file needs a header row with Date, Scheme (or AMFI code), Amount and Units, and ideally a Type column (Purchase, SIP, Redemption)."] };
  }
  const h = rows[headerIdx];
  const di = col(h, DATE_COLS), si = col(h, SCHEME_COLS), ci = col(h, CODE_COLS);
  const ai = col(h, AMOUNT_COLS), ui = col(h, UNITS_COLS), ti = col(h, TYPE_COLS);
  const warnings: string[] = [];
  if (ui < 0) return { txns: [], warnings: ["The file has no Units column, so holdings can't be worked out. Most fund apps include units in their transaction export."] };

  const txns: FundTxn[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[di] ?? "");
    const amount = num(r[ai] ?? "");
    const units = num(r[ui] ?? "");
    const scheme = si >= 0 ? (r[si] ?? "").trim() : "";
    const code = ci >= 0 ? Math.trunc(num(r[ci] ?? "")) : NaN;
    if (!date || !Number.isFinite(amount) || !Number.isFinite(units) || amount === 0 || units === 0 || (!scheme && !(code > 0))) {
      if (r.some(Boolean)) skipped++;
      continue;
    }
    // Sells are marked by the type text, or by negative units/amounts.
    const kind = (ti >= 0 && SELL.test(r[ti] ?? "")) || units < 0 ? "sell" : "buy";
    txns.push({ date, scheme: scheme || String(code), code: code > 0 ? code : undefined, amount: Math.abs(amount), units: Math.abs(units), kind });
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped > 1 ? "s" : ""} without a date, amount, units and scheme.`);
  txns.sort((a, b) => a.date.localeCompare(b.date));
  return { txns, warnings };
}

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

/** XIRR: the annual rate r at which the cash flows' present value is zero,
 *  with each flow discounted by (1 + r)^(days / 365). Money paid in is
 *  negative, money received (and today's value) positive. Newton's method,
 *  falling back to bisection if it doesn't settle. Returns null when no
 *  rate exists (all flows the same sign). */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
  const ts = flows.map((f) => days(t0, f.date) / 365);
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - ts[i] * f.amount / Math.pow(1 + r, ts[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r), d = dnpv(r);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisection over a wide bracket.
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  return (lo + hi) / 2;
}

export type FundSummary = {
  key: string; scheme: string; code?: number;
  units: number; invested: number; redeemed: number;
  costHeld: number;      // average cost of the units still held
  firstDate: string; txns: number;
};

/** Group transactions by fund: units held now, money put in and taken out. */
export function summarise(txns: FundTxn[]): FundSummary[] {
  const by = new Map<string, FundSummary>();
  for (const t of txns) {
    const key = t.code ? `#${t.code}` : t.scheme.toLowerCase();
    const s = by.get(key) ?? { key, scheme: t.scheme, code: t.code, units: 0, invested: 0, redeemed: 0, costHeld: 0, firstDate: t.date, txns: 0 };
    if (t.kind === "buy") { s.units += t.units; s.invested += t.amount; s.costHeld += t.amount; }
    else {
      // A sale removes its share of the cost at the average cost so far.
      const avg = s.units > 0 ? s.costHeld / s.units : 0;
      s.costHeld = Math.max(0, s.costHeld - avg * t.units);
      s.units -= t.units; s.redeemed += t.amount;
    }
    s.txns++;
    by.set(key, s);
  }
  return Array.from(by.values()).map((s) => ({ ...s, units: Math.max(0, +s.units.toFixed(4)), costHeld: Math.round(s.costHeld) }));
}

/** Cash flows for XIRR: buys negative, sells positive, plus today's value. */
export function flowsFor(txns: FundTxn[], valueNow: number, valueDate: string) {
  const flows = txns.map((t) => ({ date: t.date, amount: t.kind === "buy" ? -t.amount : t.amount }));
  if (valueNow > 0) flows.push({ date: valueDate, amount: valueNow });
  return flows;
}
