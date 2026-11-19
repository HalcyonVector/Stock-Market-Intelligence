const REPO = "https://github.com/HalcyonVector/Stock-Market-Intelligence";

const DATA: [string, string, string][] = [
  ["Yahoo Finance (yfinance)", "https://github.com/ranaroussi/yfinance", "Daily price history for US and NSE stocks, earnings and dividend dates"],
  ["Finnhub", "https://finnhub.io/docs/api", "Delayed US quotes, company profiles, news, analyst ratings, insider filings"],
  ["Twelve Data", "https://twelvedata.com/docs", "Backup US daily history"],
  ["Alpha Vantage", "https://www.alphavantage.co/documentation/", "Fallback US quotes"],
  ["FRED", "https://fred.stlouisfed.org/docs/api/fred/", "US economic release calendar"],
  ["Federal Reserve", "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "FOMC meeting dates"],
  ["mfapi.in", "https://www.mfapi.in", "Indian mutual fund NAV history"],
  ["US Treasury FiscalData", "https://fiscaldata.treasury.gov", "Treasury bill rates"],
  ["Groq", "https://console.groq.com/docs", "LLM for briefings and research summaries"],
];

const REFS: [string, string][] = [
  ["SARIMAX model (statsmodels)", "https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html"],
  ["ARIMA models, Forecasting: Principles and Practice", "https://otexts.com/fpp3/arima.html"],
  ["The Sharpe Ratio, W. F. Sharpe (1994)", "https://web.stanford.edu/~wfsharpe/art/sr/sr.htm"],
  ["Maximum drawdown", "https://www.investopedia.com/terms/m/maximum-drawdown-mdd.asp"],
  ["Correlation coefficient", "https://www.investopedia.com/terms/c/correlationcoefficient.asp"],
  ["CNN Fear and Greed Index (gauge design)", "https://www.cnn.com/markets/fear-and-greed"],
];

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink-300 underline-offset-2 hover:text-crimson-300 hover:underline">
      {children}
    </a>
  );
}

/** About / Data / References footer shared by the app shell and the welcome page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-4 pb-4 pt-8 text-[12px] leading-relaxed text-ink-400 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-200">About</h2>
          <p>
            A study of US and Indian stocks: how the two markets move, with research, portfolio and strategy tools to explore it.
          </p>
          <p className="mt-2">
            Educational use only. Not investment advice, no trades are executed, and data may be delayed or wrong, so verify
            independently.
          </p>
          <p className="mt-2"><Ext href={REPO}>Source code on GitHub</Ext></p>
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-200">Data</h2>
          <ul className="space-y-1.5">
            {DATA.map(([name, href, what]) => (
              <li key={name}><Ext href={href}>{name}</Ext>: {what}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-200">References</h2>
          <ul className="space-y-1.5">
            {REFS.map(([name, href]) => (
              <li key={name}><Ext href={href}>{name}</Ext></li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-white/5 pt-4 text-center">
        <span>Built by <strong className="text-ink-200">Sagnik</strong></span>
        <Ext href="https://github.com/HalcyonVector">GitHub @HalcyonVector</Ext>
        <Ext href={REPO}>Repository</Ext>
        <Ext href={`${REPO}/blob/main/LICENSE`}>MIT License</Ext>
      </div>
    </footer>
  );
}
