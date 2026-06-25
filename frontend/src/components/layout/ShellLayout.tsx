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
        <footer className="border-t border-white/5 py-3 text-center text-xs text-ink-500">
          Educational and informational use only. Not personalized investment advice.
        </footer>
      </div>
    </div>
  );
}
