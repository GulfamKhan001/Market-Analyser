const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

async function fetchFormData<T>(endpoint: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// Market Data
export const marketAPI = {
  getPrices: (ticker: string, period = "6mo") =>
    fetchAPI<{ ticker: string; count: number; data: any[] }>(
      `/market/prices/${ticker}?period=${period}`
    ),
  getFundamentals: (ticker: string) =>
    fetchAPI<any>(`/market/fundamentals/${ticker}`),
  getMacro: () =>
    fetchAPI<{ indicators: Record<string, any> }>("/market/macro"),
  getNews: (ticker: string, limit = 20) =>
    fetchAPI<{ ticker: string; count: number; articles: any[] }>(
      `/market/news/${ticker}?limit=${limit}`
    ),
  refreshTicker: (ticker: string) =>
    fetchAPI<any>(`/market/refresh/${ticker}`, { method: "POST" }),
  refreshMacro: () =>
    fetchAPI<any>("/market/refresh-macro", { method: "POST" }),
};

// Analysis
export const analysisAPI = {
  getTechnical: (ticker: string, timeframe = "daily") =>
    fetchAPI<any>(`/analysis/technical/${ticker}?timeframe=${timeframe}`),
  getFundamental: (ticker: string) =>
    fetchAPI<any>(`/analysis/fundamental/${ticker}`),
  getConfluence: (ticker: string) =>
    fetchAPI<any>(`/analysis/confluence/${ticker}`),
  getScreener: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return fetchAPI<{ count: number; results: any[] }>(`/analysis/screener?${query}`);
  },
  getFullAnalysis: (ticker: string) =>
    fetchAPI<any>(`/analysis/full/${ticker}`),
  scan: () =>
    fetchAPI<any>("/analysis/scan", { method: "POST" }),
};

// Portfolio
export const portfolioAPI = {
  getPositions: () =>
    fetchAPI<{ count: number; positions: any[] }>("/portfolio/positions"),
  addPosition: (data: any) =>
    fetchAPI<any>("/portfolio/positions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePosition: (id: number, data: any) =>
    fetchAPI<any>(`/portfolio/positions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deletePosition: (id: number) =>
    fetchAPI<any>(`/portfolio/positions/${id}`, { method: "DELETE" }),
  getSummary: () => fetchAPI<any>("/portfolio/summary"),
  getRisk: () => fetchAPI<any>("/portfolio/risk"),
  getOptimize: () => fetchAPI<any>("/portfolio/optimize"),
  getPositionSize: (ticker: string) =>
    fetchAPI<any>(`/portfolio/position-size/${ticker}`),
  refreshPrices: () =>
    fetchAPI<any>("/portfolio/refresh-prices", { method: "POST" }),
  takeSnapshot: () =>
    fetchAPI<any>("/portfolio/snapshot", { method: "POST" }),
  getTransactions: (ticker?: string, limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (ticker) params.set("ticker", ticker);
    return fetchAPI<{ transactions: any[] }>(`/portfolio/transactions?${params}`);
  },
  getCash: () => fetchAPI<any>("/portfolio/cash"),
  depositCash: (amount: number) =>
    fetchAPI<any>("/portfolio/cash/deposit", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  withdrawCash: (amount: number) =>
    fetchAPI<any>("/portfolio/cash/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  getMonteCarlo: (paths = 1000, horizon = 252) =>
    fetchAPI<any>(`/portfolio/monte-carlo?paths=${paths}&horizon=${horizon}`),
  getStressTest: () => fetchAPI<any>("/portfolio/stress-test"),
  runCustomStress: (drops: number[]) =>
    fetchAPI<any>("/portfolio/stress-test", {
      method: "POST",
      body: JSON.stringify({ drops }),
    }),
  getConcentration: () => fetchAPI<any>("/portfolio/concentration"),
  getCorrelationClusters: (threshold = 0.7) =>
    fetchAPI<any>(`/portfolio/correlation-clusters?threshold=${threshold}`),
  getCurrency: () => fetchAPI<any>("/portfolio/currency"),
  getTWR: () => fetchAPI<any>("/portfolio/twr"),
  getHealth: () => fetchAPI<any>("/portfolio/health"),
  importVested: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetchFormData<any>("/portfolio/import-vested", formData);
  },
};

// AI
export const aiAPI = {
  analyzeTicker: (ticker: string, deep = false) =>
    fetchAPI<any>(`/ai/analyze/${ticker}?deep=${deep}`),
  screenTickers: (tickers?: string[]) => {
    const query = tickers ? `?${tickers.map((t) => `tickers=${t}`).join("&")}` : "";
    return fetchAPI<any>(`/ai/screen${query}`, { method: "POST" });
  },
  getOutlook: () => fetchAPI<any>("/ai/outlook"),
  getPortfolioReview: (force = false) =>
    fetchAPI<any>(`/ai/portfolio-review?force=${force}`),
  portfolioQuery: (query: string) =>
    fetchAPI<{ answer: string }>("/ai/portfolio-query", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
};

// Regime
export const regimeAPI = {
  getCurrent: () => fetchAPI<any>("/regime/current"),
  getHistory: (days = 90) =>
    fetchAPI<any>(`/regime/history?days=${days}`),
  getMacroDashboard: () => fetchAPI<any>("/regime/macro-dashboard"),
  refresh: () => fetchAPI<any>("/regime/refresh", { method: "POST" }),
};
