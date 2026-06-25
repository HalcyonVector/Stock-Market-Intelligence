"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  LayoutDashboard,
  Briefcase,
  Newspaper,
  Star,
  Filter,
  Grid3x3,
  GitCompare,
  FlaskConical,
  Shield,
  Bell,
  Command,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/ui/CommandPalette";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { href: "/research", icon: Newspaper, label: "Research" },
  { href: "/watchlists", icon: Star, label: "Watchlists" },
  { href: "/screener", icon: Filter, label: "Screener" },
  { href: "/heatmap", icon: Grid3x3, label: "Heatmap" },
  { href: "/compare", icon: GitCompare, label: "Compare" },
  { href: "/backtest", icon: FlaskConical, label: "Backtest" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/invest", icon: Shield, label: "Safe Invest" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Global ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Stock detail pages highlight nothing in nav
  const isStockPage = pathname.startsWith("/stock/");

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-50 flex h-screen flex-col border-r border-white/5",
          "bg-base-950/60 backdrop-blur-2xl transition-all duration-300",
          expanded ? "w-56" : "w-16"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-crimson-grad shadow-glow">
            <Activity size={18} />
          </span>
          {expanded && (
            <span className="whitespace-nowrap overflow-hidden">
              <span className="text-lg font-bold tracking-tight text-white">Stock</span><span className="text-lg font-bold tracking-tight text-crimson-400">Intel</span>
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                  active && !isStockPage
                    ? "bg-crimson-600/15 text-crimson-300 shadow-[0_0_12px_rgba(225,29,58,0.15)]"
                    : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
                )}
              >
                <Icon
                  size={20}
                  className={cn(
                    "shrink-0 transition-colors",
                    active && !isStockPage ? "text-crimson-400" : "text-ink-500 group-hover:text-ink-300"
                  )}
                />
                {expanded && <span className="whitespace-nowrap">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Search shortcut */}
        <div className="border-t border-white/5 px-2 py-3">
          <button
            onClick={() => setCmdOpen(true)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
              "text-ink-500 transition hover:bg-white/5 hover:text-ink-300"
            )}
          >
            <Command size={18} className="shrink-0" />
            {expanded && (
              <>
                <span className="flex-1 text-left">Search</span>
                <kbd className="rounded bg-black/40 px-1.5 text-[10px] text-ink-500">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-white/5 px-2 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-ink-500 transition hover:bg-white/5 hover:text-ink-300"
          >
            {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
