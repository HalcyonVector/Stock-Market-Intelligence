import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function scoreColor(v: number) {
  if (v >= 70) return "text-emerald-400";
  if (v >= 45) return "text-amber-400";
  return "text-crimson-400";
}

export function changeColor(n: number) {
  return n >= 0 ? "text-emerald-400" : "text-crimson-400";
}

/** Currency symbol for a ticker: NSE/BSE listings trade in rupees. */
export function currencySymbol(symbol?: string) {
  // Accepts a ticker ("TCS.NS") or a currency code from the API ("INR").
  // Tracked NSE stocks have no suffix, so prefer passing the quote's currency.
  return symbol && (symbol === "INR" || /\.(NS|BO)$/i.test(symbol)) ? "₹" : "$";
}

/** Price with the right currency symbol, e.g. money(2950.4, "RELIANCE.NS") -> "₹2950.40". */
export function money(price: number | null | undefined, symbol?: string, digits = 2) {
  if (price == null || Number.isNaN(price)) return "—";
  return `${currencySymbol(symbol)}${price.toFixed(digits)}`;
}
