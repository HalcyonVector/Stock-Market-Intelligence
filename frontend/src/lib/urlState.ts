"use client";
import { useEffect, useRef, useState } from "react";

const SYMBOL_RE = /^[A-Z0-9.^=&-]{1,20}$/;

/**
 * A list of tickers kept in the page URL (`?s=AAPL,MSFT`), so the current view
 * can be shared as a plain link — no server storage needed.
 */
export function useUrlSymbols(defaults: string[], param = "s", max = 10) {
  const [symbols, setSymbols] = useState<string[]>(defaults);
  const loaded = useRef(false);

  // Read once on mount (window, not useSearchParams, to keep pages static).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(param);
    if (raw) {
      const parsed = Array.from(
        new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)))
      ).slice(0, max);
      if (parsed.length) setSymbols(parsed);
    }
    loaded.current = true;
  }, [param, max]);

  // Mirror changes back into the URL without adding history entries.
  useEffect(() => {
    if (!loaded.current) return;
    const url = new URL(window.location.href);
    if (symbols.length) url.searchParams.set(param, symbols.join(","));
    else url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [symbols, param]);

  return [symbols, setSymbols] as const;
}
