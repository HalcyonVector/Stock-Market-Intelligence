"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Market = "GLOBAL" | "US" | "IN";
export const MARKETS: { id: Market; label: string; title: string }[] = [
  { id: "GLOBAL", label: "Global", title: "US + India universe" },
  { id: "US", label: "US", title: "US stocks only" },
  { id: "IN", label: "India", title: "NSE stocks only" },
];

const KEY = "si_market";

const MarketCtx = createContext<{ market: Market; setMarket: (m: Market) => void }>({
  market: "GLOBAL",
  setMarket: () => {},
});

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarketState] = useState<Market>("GLOBAL");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Market | null;
      if (saved && MARKETS.some((m) => m.id === saved)) setMarketState(saved);
    } catch { /* ignore */ }
  }, []);

  const setMarket = (m: Market) => {
    setMarketState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };

  return <MarketCtx.Provider value={{ market, setMarket }}>{children}</MarketCtx.Provider>;
}

/** The market the dashboard is scoped to (persisted per browser). */
export function useMarket(): Market {
  return useContext(MarketCtx).market;
}

export function useSetMarket() {
  return useContext(MarketCtx).setMarket;
}
