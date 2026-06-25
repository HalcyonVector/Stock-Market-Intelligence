"use client";
import { Sidebar } from "./Sidebar";
import { TickerTape } from "./TickerTape";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TickerTape />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
        <footer className="border-t border-white/5 px-6 py-3 text-center text-[11px] leading-relaxed text-ink-400">
          <span className="font-medium text-ink-300">Educational and informational use only.</span>{" "}
          Not personalized investment advice. Nothing here is a recommendation to buy or sell any
          security. No brokerage credentials are stored and no trades are executed. Market data may be
          delayed or inaccurate — verify independently before making any financial decision.
        </footer>
      </div>
    </div>
  );
}
