// Thin API client. All requests go through Next.js rewrites -> FastAPI.
const BASE = "/api/v1";

// In-memory token (set via login()). No localStorage in MVP.
let TOKEN: string | null = null;
export function setToken(t: string | null) { TOKEN = t; }

function authHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : { "X-User-Id": "demo" };
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return (json.data ?? json) as T;
}

async function get<T>(path: string): Promise<T> {
  return req<T>(path);
}

export const api = {
  movers: (market = "GLOBAL") => get<any>(`/market/movers?market=${market}`),
  quote: (s: string) => get<any>(`/market/quote/${s}`),
  candles: (s: string, interval?: string, lookback?: number) =>
    get<any[]>(`/market/candles/${s}?interval=${interval ?? "1d"}&lookback=${lookback ?? 90}`),
  heatmap: () => get<any>(`/market/heatmap`),
  discovery: (market = "GLOBAL") => get<any[]>(`/discovery?market=${market}`),
  buckets: (market = "GLOBAL") => get<any>(`/discovery/buckets?market=${market}`),
  sectors: (market = "GLOBAL") => get<any[]>(`/sectors/rotation?market=${market}`),
  trending: (market = "GLOBAL") => get<any[]>(`/sentiment/trending?market=${market}`),
  stock: (s: string) => get<any>(`/stocks/${s}`),
  why: (s: string) => get<any>(`/stocks/${s}/why`),
  technicals: (s: string) => get<any>(`/stocks/${s}/technicals`),
  fundamentals: (s: string) => get<any>(`/stocks/${s}/fundamentals`),
  research: (s: string) => get<any>(`/stocks/${s}/research`),
  forecast: (s: string, days?: number) => get<any>(`/stocks/${s}/forecast?days=${days ?? 30}`),
  briefing: (market = "GLOBAL") => get<any>(`/insights/briefing?market=${market}`),
  news: (limit = 20) => get<any[]>(`/insights/news?limit=${limit}`),
  earnings: () => get<any[]>(`/insights/earnings`),
  economicCalendar: () => get<any>(`/insights/economic-calendar`),
  backtestStrategies: () => get<any[]>(`/backtest/strategies`),
  backtest: (symbol: string, strategy: string, params?: any, capital?: number, lookback?: number) =>
    req<any>("/backtest", {
      method: "POST",
      body: JSON.stringify({ symbol, strategy, params, initial_capital: capital ?? 10000, lookback: lookback ?? 365 }),
    }),
  screener: (filters: Record<string, any>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
    }
    return get<any>(`/screener?${params.toString()}`);
  },
  portfolio: (symbols?: string[]) =>
    get<any>(`/portfolio/analyze${symbols?.length ? `?symbols=${symbols.join(",")}` : ""}`),
  savedPortfolios: () => get<any[]>("/portfolio/saved"),
  savePortfolio: (name: string, symbols: string[], weights?: Record<string, number>) =>
    req<any>("/portfolio/saved", { method: "POST", body: JSON.stringify({ name, symbols, weights }) }),
  deletePortfolio: (name: string) =>
    req<void>(`/portfolio/saved/${encodeURIComponent(name)}`, { method: "DELETE" }),
  rebalance: (symbols: string[], targetWeights: Record<string, number>, portfolioValue: number = 100000) =>
    req<any>("/portfolio/rebalance", {
      method: "POST",
      body: JSON.stringify({ symbols, target_weights: targetWeights, portfolio_value: portfolioValue }),
    }),

  // --- Safe Invest ---
  instruments: (country = "IN") => get<any>(`/invest/instruments?country=${country}`),
  riskProfiles: () => get<any[]>(`/invest/profiles`),
  sipCalc: (monthly: number, rate: number, years: number, stepUp = 0) =>
    get<any>(`/invest/sip?monthly=${monthly}&rate=${rate}&years=${years}&step_up=${stepUp}`),
  goalPlan: (target: number, years: number, rate: number) =>
    get<any>(`/invest/goal?target=${target}&years=${years}&rate=${rate}`),
  investAdvise: (question: string, context: any) =>
    req<any>("/invest/advise", {
      method: "POST",
      body: JSON.stringify({ question, ...context }),
    }),
  investAllocate: (totalMonthly: number, allocations: Array<{instrument_id: string; pct: number}>, years: number, country = "IN") =>
    req<any>("/invest/allocate", {
      method: "POST",
      body: JSON.stringify({ total_monthly: totalMonthly, allocations, years, country }),
    }),

  // --- Alerts ---
  alerts: () => get<any[]>("/alerts"),
  createAlert: (symbol: string, condition: string, threshold: number, note?: string) =>
    req<any>("/alerts", { method: "POST", body: JSON.stringify({ symbol, condition, threshold, note }) }),
  deleteAlert: (id: string) => req<void>(`/alerts/${id}`, { method: "DELETE" }),
  checkAlerts: () => get<any[]>("/alerts/check"),

  // --- Auth ---
  login: async (userId: string) => {
    const r = await req<{ access_token: string }>("/auth/token", {
      method: "POST", body: JSON.stringify({ user_id: userId }),
    });
    setToken(r.access_token);
    return r;
  },
  me: () => get<any>("/auth/me"),

  // --- Watchlists ---
  watchlists: () => get<any[]>("/watchlists"),
  createWatchlist: (name: string) =>
    req<any>("/watchlists", { method: "POST", body: JSON.stringify({ name }) }),
  deleteWatchlist: (id: number) => req<void>(`/watchlists/${id}`, { method: "DELETE" }),
  getWatchlist: (id: number) => get<any>(`/watchlists/${id}`),
  addToWatchlist: (id: number, symbol: string) =>
    req<any>(`/watchlists/${id}/items`, { method: "POST", body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (id: number, symbol: string) =>
    req<any>(`/watchlists/${id}/items/${symbol}`, { method: "DELETE" }),
};

export const WS_URL =
  (typeof window !== "undefined" ? window.location.origin.replace(/^http/, "ws") : "") +
  "/api/v1/ws/live";
