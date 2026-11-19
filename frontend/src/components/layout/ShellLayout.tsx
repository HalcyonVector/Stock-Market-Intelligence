"use client";
import { Sidebar } from "./Sidebar";
import { TickerTape } from "./TickerTape";
import { ServerStatus } from "./ServerStatus";
import { SiteFooter } from "./SiteFooter";
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
        <SiteFooter />
      </div>
      <AlertNotifier />
      <Toaster />
    </div>
  );
}
