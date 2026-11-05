// Thin API client. All requests go through Next.js rewrites -> FastAPI.
const BASE = "/api/v1";

// Anonymous per-browser identity. There are no accounts: the backend mints a
// random user id + signed token on first use (POST /auth/anon) and we keep it
// in localStorage so watchlists/alerts/paper trades survive reloads.
const TOKEN_KEY = "si_anon_token";
let TOKEN: string | null = null;
let tokenPromise: Promise<string> | null = null;

function readStoredToken(): string | null {
  if (TOKEN) return TOKEN;
  try { TOKEN = window.localStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  return TOKEN;
}

function storeToken(t: string | null) {
  TOKEN = t;
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: token lives for this tab only */ }
}

/** True once this browser has an identity (i.e. has used a personal feature). */
export function hasIdentity(): boolean {
  return typeof window !== "undefined" && !!readStoredToken();
}

async function ensureToken(): Promise<string> {
  const existing = readStoredToken();
  if (existing) return existing;
  if (!tokenPromise) {
    tokenPromise = fetch(`${BASE}/auth/anon`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new ApiError("/auth/anon", res.status);
        const { access_token } = await res.json();
        storeToken(access_token);
        return access_token as string;
      })
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

/** Thrown for non-2xx responses so callers can branch on status. */
export class ApiError extends Error {
  constructor(public path: string, public status: number, public detail?: string) {
    super(detail || `API ${path} -> ${status}`);
  }
}

async function req<T>(path: string, init: RequestInit = {}, authed = false): Promise<T> {
  // Only user-scoped calls carry a token. Public market-data requests stay
  // header-free so Vercel's edge cache can share them across visitors.
  const doFetch = async () => {
    const auth: Record<string, string> = authed ? { Authorization: `Bearer ${await ensureToken()}` } : {};
    return fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...auth, ...(init.headers || {}) },
    });
  };
  let res = await doFetch();
  if (authed && res.status === 401) {
    // Token expired or the server's secret rotated: get a fresh identity once.
    storeToken(null);
    res = await doFetch();
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch { /* non-JSON error body */ }
    throw new ApiError(path, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return (json.data ?? json) as T;
}

async function get<T>(path: string): Promise<T> {
  return req<T>(path);
}

const user = {
  get: <T>(path: string) => req<T>(path, {}, true),
  send: <T>(path: string, method: string, body?: unknown) =>
    req<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }, true),
};

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
  search: (q: string) => get<any[]>(`/stocks/search?q=${encodeURIComponent(q)}`),
  events: (symbols: string[], days = 90) =>
    get<any>(`/insights/events?symbols=${encodeURIComponent(symbols.join(","))}&days=${days}`),
  why: (s: string) => get<any>(`/stocks/${s}/why`),
  technicals: (s: string) => get<any>(`/stocks/${s}/technicals`),
  fundamentals: (s: string) => get<any>(`/stocks/${s}/fundamentals`),
  research: (s: string) => get<any>(`/stocks/${s}/research`),
  forecast: (s: string, days?: number) => get<any>(`/stocks/${s}/forecast?days=${days ?? 30}`),
  briefing: (market = "GLOBAL") => get<any>(`/insights/briefing?market=${market}`),
  news: (limit = 20) => get<any[]>(`/insights/news?limit=${limit}`),
  earnings: () => get<any[]>(`/insights/earnings`),
  economicCalendar: () => get<any>(`/insights/economic-calendar`),
  insiderActivity: () => get<any[]>(`/insights/insider-activity`),
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
  savedPortfolios: () => user.get<any[]>("/portfolio/saved"),
  savePortfolio: (name: string, symbols: string[], weights?: Record<string, number>) =>
    user.send<any>("/portfolio/saved", "POST", { name, symbols, weights }),
  deletePortfolio: (name: string) =>
    user.send<void>(`/portfolio/saved/${encodeURIComponent(name)}`, "DELETE"),
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
  investAllocate: (totalMonthly: number, allocations: Array<{instrument_id: string; pct: number}>, years: number, country = "IN", lumpSum = 0) =>
    req<any>("/invest/allocate", {
      method: "POST",
      body: JSON.stringify({ total_monthly: totalMonthly, allocations, years, country, lump_sum: lumpSum }),
    }),

  // --- Alerts ---
  alerts: () => user.get<any[]>("/alerts"),
  createAlert: (symbol: string, condition: string, threshold: number, note?: string) =>
    user.send<any>("/alerts", "POST", { symbol, condition, threshold, note }),
  deleteAlert: (id: string) => user.send<void>(`/alerts/${id}`, "DELETE"),
  checkAlerts: () => user.get<any[]>("/alerts/check"),

  // --- Identity ---
  me: () => user.get<any>("/auth/me"),

  // --- Watchlists ---
  watchlists: () => user.get<any[]>("/watchlists"),
  createWatchlist: (name: string) => user.send<any>("/watchlists", "POST", { name }),
  deleteWatchlist: (id: number) => user.send<void>(`/watchlists/${id}`, "DELETE"),
  getWatchlist: (id: number) => user.get<any>(`/watchlists/${id}`),
  watchlistDigest: (id: number) => user.get<any>(`/watchlists/${id}/digest`),
  addToWatchlist: (id: number, symbol: string) =>
    user.send<any>(`/watchlists/${id}/items`, "POST", { symbol }),
  removeFromWatchlist: (id: number, symbol: string) =>
    user.send<any>(`/watchlists/${id}/items/${symbol}`, "DELETE"),

  // --- Paper trading ---
  paperAccount: () => user.get<any>("/paper"),
  paperTrade: (symbol: string, side: "buy" | "sell", quantity: number) =>
    user.send<any>("/paper/orders", "POST", { symbol, side, quantity }),
  paperReset: () => user.send<any>("/paper/reset", "POST"),
  paperHistory: () => user.get<any>("/paper/history"),

  // --- Web Push (alerts with the site closed) ---
  pushStatus: () => user.get<{ enabled: boolean; public_key: string | null; devices: number }>("/alerts/push"),
  pushSubscribe: (sub: PushSubscriptionJSON) => user.send<any>("/alerts/push", "POST", sub),
  pushUnsubscribe: (endpoint: string) => user.send<any>("/alerts/push/unsubscribe", "POST", { endpoint }),
  pushTest: () => user.send<{ sent: number }>("/alerts/push/test", "POST"),
};

// Vercel rewrites only proxy HTTP, not WebSocket.
// In production, connect WS directly to the backend.
const _wsBase =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined" ? window.location.origin.replace(/^http/, "ws") : "");
export const WS_URL = _wsBase + "/api/v1/ws/live";
