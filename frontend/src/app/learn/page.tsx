"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { GLOSSARY } from "@/components/ui/Term";

/* Beginner guide: short lessons that point into the app, plus every term the
 * app's tooltips explain, searchable in one place. Static content, so it
 * costs nothing to serve. */

const LESSONS: { title: string; body: string; href: string; cta: string }[] = [
  {
    title: "1. Start with safety, not stocks",
    body: "Before buying any share, keep about six months of expenses somewhere you can withdraw any day (a savings account, liquid fund or sweep FD). Then use tax-free or guaranteed options (PPF, EPF/VPF) for long-term money.",
    href: "/invest", cta: "Plan an emergency fund in Safe Invest",
  },
  {
    title: "2. Compare returns after tax and inflation",
    body: "A 7% FD taxed at 30% and eaten by 5% inflation leaves you almost nothing in real terms. The headline rate is rarely what you keep.",
    href: "/invest", cta: "Open the After Tax & Inflation tab",
  },
  {
    title: "3. Prefer regular investing to timing the market",
    body: "A monthly SIP into a broad index fund removes the hardest decision (when to buy). Spreading a lump sum out costs a little on average but protects you from investing everything right before a fall.",
    href: "/invest", cta: "Try the SIP calculator",
  },
  {
    title: "4. Read a stock page before you trust a tip",
    body: "Check what the company earns (P/E, margins), how bumpy the price is (volatility, beta, max drawdown) and why it's moving today. A big move on high volume usually has a news reason.",
    href: "/stock/RELIANCE", cta: "Open a stock page",
  },
  {
    title: "5. Practise with fake money first",
    body: "Paper trading uses real (delayed) prices and virtual cash, and the performance chart shows whether your picks actually beat simply holding the index.",
    href: "/paper", cta: "Start paper trading",
  },
  {
    title: "6. Diversify, then check the risk you're taking",
    body: "Holding 10 stocks in one sector is not diversification. Import your holdings to see weights, correlation and how the mix would have done in past crashes.",
    href: "/portfolio", cta: "Analyse a portfolio",
  },
];

const INDIA_TERMS: Record<string, string> = {
  SIP: "Systematic Investment Plan: investing a fixed amount every month, usually into a mutual fund.",
  NAV: "Net Asset Value: the price of one unit of a mutual fund, published once a day after the market closes.",
  "Expense Ratio": "The yearly fee a fund charges, taken out of the NAV. Direct plans charge less than Regular plans.",
  "Direct vs Regular": "Same fund, two plans. Regular pays a distributor commission from your returns; Direct doesn't, so it usually grows faster.",
  "Growth vs IDCW": "Growth reinvests everything. IDCW (dividend) pays some out, and the NAV drops by the amount paid.",
  ELSS: "Equity Linked Savings Scheme: an equity fund with a 3-year lock-in that qualifies for 80C tax deduction (old tax regime).",
  PPF: "Public Provident Fund: government-backed 15-year savings with tax-free interest. Rates are set every quarter.",
  LTCG: "Long-term capital gains. For listed shares and equity funds held over a year: 12.5% tax on gains above ₹1.25 lakh a year.",
  STCG: "Short-term capital gains. For listed shares and equity funds sold within a year: 20% tax.",
  "Index Fund": "A fund that simply holds every stock in an index (like the Nifty 50), so you get the market's return at low cost.",
  "Real Return": "Return after inflation. If prices rise 5% and your money grows 6%, your real return is about 1%.",
  CAGR: "Compound annual growth rate: the steady yearly rate that would turn the start value into the end value.",
  Diversification: "Spreading money across assets that don't all fall together, so one bad pick can't sink you.",
};

export default function LearnPage() {
  const [q, setQ] = useState("");
  const terms = useMemo(() => {
    const all = { ...INDIA_TERMS, ...GLOSSARY };
    return Object.entries(all)
      .filter(([k, v]) => !q || (k + " " + v).toLowerCase().includes(q.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [q]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen size={24} className="text-crimson-400" /> Learn the Basics
        </h1>
        <p className="mt-1 text-sm text-ink-500">Six short ideas that matter more than any single stock pick, and every term the app uses, in plain English.</p>
      </div>

      <section aria-labelledby="lessons" className="grid gap-3 md:grid-cols-2">
        <h2 id="lessons" className="sr-only">Lessons</h2>
        {LESSONS.map((l) => (
          <article key={l.title} className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-ink-100">{l.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-400">{l.body}</p>
            <Link href={l.href} className="mt-3 text-xs font-medium text-crimson-300 hover:text-crimson-200">{l.cta} →</Link>
          </article>
        ))}
      </section>

      <section aria-labelledby="glossary" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="glossary" className="text-lg font-semibold">Glossary</h2>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3">
            <Search size={14} className="text-ink-500" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a term"
              aria-label="Find a term" className="w-48 bg-transparent py-1.5 text-sm outline-none" />
          </label>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {terms.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <dt className="text-sm font-medium text-ink-100">{k}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-ink-400">{v}</dd>
            </div>
          ))}
          {!terms.length && <p className="text-sm text-ink-500">No term matches “{q}”.</p>}
        </dl>
        <p className="text-[11px] text-ink-500">Educational only, not advice. Tax rules are summarised for India&apos;s new regime (FY2026-27) and simplified.</p>
      </section>
    </div>
  );
}
