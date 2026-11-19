const REPO = "https://github.com/HalcyonVector/Stock-Market-Intelligence";

const DATA: [string, string, string][] = [
  ["Yahoo Finance", "https://github.com/ranaroussi/yfinance", "price history"],
  ["Finnhub", "https://finnhub.io/docs/api", "US quotes, news, ratings"],
  ["Twelve Data", "https://twelvedata.com/docs", "backup US history"],
  ["Alpha Vantage", "https://www.alphavantage.co/documentation/", "fallback quotes"],
  ["FRED", "https://fred.stlouisfed.org/docs/api/fred/", "US release calendar"],
  ["Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "FOMC dates"],
  ["mfapi.in", "https://www.mfapi.in", "fund NAVs"],
  ["NSE", "https://archives.nseindia.com/content/indices/ind_nifty50list.csv", "Nifty 50 members"],
  ["Wikipedia", "https://en.wikipedia.org/wiki/S%26P_100", "S&P 100 members"],
  ["US Treasury", "https://fiscaldata.treasury.gov", "T-bill rates"],
  ["Groq", "https://console.groq.com/docs", "LLM summaries"],
];

const REFS: [string, string][] = [
  ["SARIMAX (statsmodels)", "https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html"],
  ["ARIMA (FPP3)", "https://otexts.com/fpp3/arima.html"],
  ["Sharpe ratio (Sharpe 1994)", "https://web.stanford.edu/~wfsharpe/art/sr/sr.htm"],
  ["Maximum drawdown", "https://www.investopedia.com/terms/m/maximum-drawdown-mdd.asp"],
  ["Correlation", "https://www.investopedia.com/terms/c/correlationcoefficient.asp"],
  ["Zerodha charges", "https://zerodha.com/charges"],
  ["CNN Fear and Greed", "https://www.cnn.com/markets/fear-and-greed"],
];

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink-300 underline-offset-2 hover:text-crimson-300 hover:underline">
      {children}
    </a>
  );
}

const H = "mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-200";

/** About / Data / References footer shared by the app shell and the welcome page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-4 pb-3 pt-4 text-[11px] leading-snug text-ink-500 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr_1fr] md:gap-6">
        <section>
          <h2 className={H}>About</h2>
          <p>
            US and Indian stocks studied side by side, with tools to explore them. Educational only: not investment advice,
            and data may be delayed. <Ext href={REPO}>Source code</Ext>
          </p>
        </section>
        <section>
          <h2 className={H}>Data</h2>
          <p>
            {DATA.map(([name, href, what], i) => (
              <span key={name}>{i > 0 && " · "}<Ext href={href}>{name}</Ext> ({what})</span>
            ))}
          </p>
        </section>
        <section>
          <h2 className={H}>References</h2>
          <p>
            {REFS.map(([name, href], i) => (
              <span key={name}>{i > 0 && " · "}<Ext href={href}>{name}</Ext></span>
            ))}
          </p>
        </section>
      </div>
      <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/5 pt-2 text-center">
        <span>Built by <strong className="text-ink-200">Sagnik</strong></span>
        <Ext href="https://github.com/HalcyonVector">GitHub @HalcyonVector</Ext>
        <Ext href={REPO}>Repository</Ext>
        <Ext href={`${REPO}/blob/main/LICENSE`}>MIT License</Ext>
      </div>
    </footer>
  );
}
