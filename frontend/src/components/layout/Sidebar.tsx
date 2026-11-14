"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  TrendingUp,
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
  Wallet,
  Menu,
  X,
  Smartphone,
  BookOpen,
  BarChart3,
} from "lucide-react";
import { DeviceSyncDialog } from "./DeviceSync";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { MarketSwitch } from "@/components/ui/MarketSwitch";

// Grouped so eleven pages read as four short lists. Labels say what each
// tool is for (e.g. "Strategy Tester" rather than "Backtest").
const NAV_GROUPS = [
  {
    title: "Markets",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/heatmap", icon: Grid3x3, label: "Heatmap" },
      { href: "/screener", icon: Filter, label: "Screener" },
      { href: "/research", icon: Newspaper, label: "AI Research" },
      { href: "/study", icon: BarChart3, label: "Market Study" },
    ],
  },
  {
    title: "Mine",
    items: [
      { href: "/watchlists", icon: Star, label: "Watchlists" },
      { href: "/alerts", icon: Bell, label: "Alerts" },
      { href: "/paper", icon: Wallet, label: "Paper Trading" },
    ],
  },
  {
    title: "Analyse",
    items: [
      { href: "/portfolio", icon: Briefcase, label: "Portfolio Lab" },
      { href: "/compare", icon: GitCompare, label: "Compare Stocks" },
      { href: "/backtest", icon: FlaskConical, label: "Strategy Tester" },
    ],
  },
  {
    title: "Learn",
    items: [
      { href: "/invest", icon: Shield, label: "Safe Invest" },
      { href: "/learn", icon: BookOpen, label: "Learn the Basics" },
    ],
  },
];

const COLLAPSE_KEY = "si_sidebar_collapsed";

function Logo({ showText }: { showText: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="StockIntel home">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-crimson-grad shadow-glow">
        <TrendingUp size={18} className="text-white" />
      </span>
      {showText && (
        <span className="overflow-hidden whitespace-nowrap text-lg font-bold leading-none">
          <span className="text-white">Stock</span>
          <span className="relative top-px text-[20px] text-crimson-400">Intel</span>
        </span>
      )}
    </Link>
  );
}

function NavLinks({ expanded, onNavigate }: { expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Stock detail pages highlight nothing in nav
  const isStockPage = pathname.startsWith("/stock/");
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title} className={cn("space-y-0.5", gi > 0 && "mt-2.5")}>
          {expanded ? (
            <p className="px-3 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-600">{group.title}</p>
          ) : (
            gi > 0 && <div className="mx-3 mb-2 border-t border-white/5" aria-hidden />
          )}
      {group.items.map(({ href, icon: Icon, label }) => {
        const active = !isStockPage && (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            title={expanded ? undefined : label}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60",
              active
                ? "bg-crimson-600/15 text-crimson-300 shadow-[0_0_12px_rgba(225,29,58,0.15)]"
                : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
            )}
          >
            <Icon
              size={20}
              aria-hidden
              className={cn(
                "shrink-0 transition-colors",
                active ? "text-crimson-400" : "text-ink-500 group-hover:text-ink-300"
              )}
            />
            {expanded && <span className="whitespace-nowrap">{label}</span>}
          </Link>
        );
      })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  // Remember the collapsed state between visits.
  useEffect(() => {
    try { if (localStorage.getItem(COLLAPSE_KEY) === "1") setExpanded(false); } catch { /* ignore */ }
  }, []);
  const toggleExpanded = () => {
    setExpanded((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
      return !v;
    });
  };

  // Close the mobile drawer on navigation.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Global ⌘K shortcut + Esc to close the drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const searchButton = (showLabel: boolean) => (
    <button
      onClick={() => { setMobileOpen(false); setCmdOpen(true); }}
      aria-label="Search stocks and pages"
      title={showLabel ? undefined : "Search (⌘K)"}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-500 transition hover:bg-white/5 hover:text-ink-300"
    >
      <Command size={18} className="shrink-0" aria-hidden />
      {showLabel && (
        <>
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded bg-black/40 px-1.5 text-[10px] text-ink-500">⌘K</kbd>
        </>
      )}
    </button>
  );

  const syncButton = (showLabel: boolean) => (
    <button
      onClick={() => { setMobileOpen(false); setSyncOpen(true); }}
      aria-label="Use on another device"
      title={showLabel ? undefined : "Use on another device"}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-500 transition hover:bg-white/5 hover:text-ink-300"
    >
      <Smartphone size={18} className="shrink-0" aria-hidden />
      {showLabel && <span className="flex-1 text-left">Other devices</span>}
    </button>
  );

  return (
    <>
      {/* Mobile top bar (below md) */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/5 bg-base-950/90 px-4 backdrop-blur-xl md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5"
        >
          <Menu size={20} />
        </button>
        <Logo showText />
        <button
          onClick={() => setCmdOpen(true)}
          aria-label="Search stocks and pages"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5"
        >
          <Command size={18} />
        </button>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 md:hidden"
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="fixed inset-y-0 left-0 z-[70] flex w-64 flex-col border-r border-white/5 bg-base-950 md:hidden"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <Logo showText />
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="border-b border-white/5 px-3 py-3"><MarketSwitch /></div>
              <NavLinks expanded />
              <div className="border-t border-white/5 px-2 py-3">{searchButton(true)}{syncButton(true)}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar (md and up) */}
      <aside
        className={cn(
          "sticky top-0 z-50 hidden h-screen flex-col border-r border-white/5 md:flex",
          "bg-base-950/60 backdrop-blur-2xl transition-all duration-300",
          expanded ? "w-56" : "w-16"
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/5 py-4 pl-[14px] pr-3">
          <Logo showText={expanded} />
        </div>

        {expanded && <div className="border-b border-white/5 px-3 py-3"><MarketSwitch /></div>}

        <NavLinks expanded={expanded} />

        <div className="border-t border-white/5 px-2 py-3">{searchButton(expanded)}{syncButton(expanded)}</div>

        <div className="border-t border-white/5 px-2 py-3">
          <button
            onClick={toggleExpanded}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-ink-500 transition hover:bg-white/5 hover:text-ink-300"
          >
            {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <DeviceSyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
    </>
  );
}
