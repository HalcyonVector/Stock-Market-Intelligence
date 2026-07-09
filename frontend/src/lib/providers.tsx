"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Every open dashboard tab re-runs every query on this interval,
            // each a Redis read at minimum -- at 30s that's ~3-4x more Redis
            // commands per tab than the backend data even changes (caches
            // refresh every 5-15 min server-side; see staleTime below), and
            // was the single largest contributor to burning through
            // Upstash's free-tier monthly command quota.
            refetchInterval: 120_000,  // 2 min
            // No point background-refetching every 15 s when backend caches
            // don't change for 5–10 min (sectors/sentiment TTL = 10 min, briefing = 15 min).
            staleTime: 5 * 60 * 1000,   // 5 min
            // Keep unused data in memory for 30 min. The default 5 min meant
            // returning after a short break always showed skeletons while every
            // card re-fetched from scratch.
            gcTime: 30 * 60 * 1000,     // 30 min
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
