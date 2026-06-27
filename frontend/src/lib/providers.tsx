"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchInterval: 30_000,
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
