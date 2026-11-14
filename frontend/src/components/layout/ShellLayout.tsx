"use client";
import { Sidebar } from "./Sidebar";
import { TickerTape } from "./TickerTape";
import { ServerStatus } from "./ServerStatus";
import { AlertNotifier } from "./AlertNotifier";
import { Toaster } from "@/components/ui/Toaster";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* pt-14 and pb-tabbar clear the phone header and tab bar; md+ uses the sticky sidebar instead */}
      <div className="pb-tabbar flex min-w-0 flex-1 flex-col overflow-hidden pt-14 md:pt-0">
        <ServerStatus />
        <TickerTape />
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
        <footer className="border-t border-white/5 px-4 py-3 text-center text-[11px] leading-relaxed text-ink-400 sm:px-6">
          <span className="font-medium text-ink-300">Educational and informational use only.</span>{" "}
          Not personalized investment advice. Nothing here is a recommendation to buy or sell any
          security. No brokerage credentials are stored and no trades are executed. Market data may be
          delayed or inaccurate, so verify independently before making any financial decision.
        </footer>
      </div>
      <AlertNotifier />
      <Toaster />
    </div>
  );
}
