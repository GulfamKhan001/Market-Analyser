# Frontend — Market Intelligence Dashboard

The visual layer of the platform. A modern web application that turns raw numbers from the backend into interactive charts, color-coded scores, and a clean dashboard you can actually use to make investment decisions.

In plain terms: it's the part you look at.

---

## What It Shows

### 1. Dashboard (Home Page)

The first thing you see when you open the app. Shows a snapshot of everything at once:

- **Market Regime Badge** — A color-coded indicator showing the current market mood:
  - Green = RISK_ON (market is favorable, be aggressive)
  - Yellow = NEUTRAL (proceed with caution)
  - Orange = RISK_OFF (market is stressed, reduce exposure)
  - Red = CRISIS (defensive mode, protect capital)

- **Portfolio Summary** — Total value, today's return, overall gain/loss

- **Risk Stats** — Key risk numbers (VaR, Sharpe ratio, portfolio beta) displayed as easy-to-read cards

- **Top Signals** — Stocks with the highest composite scores right now

### 2. Stock Screener

A filterable table of all tracked stocks ranked by score. You can filter by:
- Minimum technical score (0-100)
- Minimum fundamental score (0-100)
- Sector (Technology, Healthcare, Energy, etc.)
- Minimum average daily volume

The table shows each stock's composite score broken down by trend, momentum, volatility, and volume — so you can see exactly why a stock ranks where it does.

### 3. Stock Analysis (Deep Dive)

Click any ticker to get the full picture:

- **Price Chart** — Interactive candlestick/line chart with historical prices
- **Technical Scores** — Radar chart showing the five score dimensions
- **Composite Score Bar** — Visual progress bar (0-100) with color coding
- **Fundamental Metrics** — Company financials laid out clearly
- **AI Analysis** — Bull/Base/Bear scenario cards with probability bars, risk factors, and suggested position size

### 4. Portfolio Manager

Where you manage your actual holdings:

- **Positions Table** — Add stocks with entry price, quantity, and date. See live unrealized P&L.
- **Risk Gauges** — Visual meters for VaR, max drawdown, and Sharpe ratio
- **Sector Allocation** — Pie/bar showing how concentrated you are
- **Optimization Suggestions** — What the math says your ideal allocation should be

### 5. Market Regime Dashboard

The macro view of the market:

- **Current Regime** — Big badge showing RISK_ON/NEUTRAL/RISK_OFF/CRISIS with confidence
- **Regime History Timeline** — How the regime has changed over time
- **Macro Indicators** — Live values for GDP, CPI, unemployment, Fed Funds rate, 10Y/2Y Treasury yields, VIX
- **Sub-Regime Details** — What each detector (HMM, VIX, Macro) is saying individually

---

## How It Works (Non-Technical)

The frontend is a website that runs in your browser. It doesn't do any calculations itself — it asks the backend API for data and displays the results visually.

When you open a page:
1. The page sends a request to the backend (e.g., "give me AAPL's technical scores")
2. The backend queries its database, runs calculations if needed, and sends back numbers
3. The frontend turns those numbers into charts, tables, scores, and color-coded badges
4. Results are cached so the page loads fast if you revisit

---

## Tech Stack and Why

| Technology | What It Does | Why This One |
|-----------|-------------|-------------|
| **Next.js 14** | React framework | Server-side rendering, file-based routing, deployed free on Vercel |
| **React 19** | UI library | Industry standard for building interactive web interfaces |
| **TypeScript** | Language | Catches bugs before they happen by adding types to JavaScript |
| **Tailwind CSS** | Styling | Write styles directly in HTML, no separate CSS files to manage |
| **Recharts** | Charts | React-native charting library, easy to customize, handles financial data well |
| **TradingView Lightweight Charts** | Candlestick charts | Professional-grade financial charts (same engine TradingView uses) |
| **TanStack Query** | Data fetching | Handles caching, refetching, loading states — so the UI stays fast and fresh |
| **Lucide React** | Icons | Clean, consistent icon set |

### Why Next.js Instead of Plain React?

Next.js adds server-side rendering (pages load with data already filled in, not blank white screens), file-based routing (create a file = create a page), and deploys to Vercel's free tier with zero configuration.

### Why Tailwind Instead of Regular CSS?

Tailwind lets you style elements inline (`className="text-red-500 font-bold p-4"`) instead of maintaining separate CSS files. For a data-heavy dashboard with many small components, this is significantly faster to develop and maintain.

### Why TanStack Query Instead of fetch()?

Raw `fetch()` means you have to manually handle loading states, error states, caching, refetching, and stale data. TanStack Query handles all of that in one line. When you switch tabs and come back, your data automatically refreshes. When the network drops, it retries. This matters for a financial dashboard where stale data is dangerous.

---

## Pages and Components

### Pages (5 routes)

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Dashboard home |
| `/screener` | `app/screener/page.tsx` | Stock screener with filters |
| `/analysis/[ticker]` | `app/analysis/[ticker]/page.tsx` | Deep dive on any stock |
| `/portfolio` | `app/portfolio/page.tsx` | Portfolio management |
| `/regime` | `app/regime/page.tsx` | Market regime dashboard |

### Components (12 reusable pieces)

**Charts:**
- `PriceChart` — Line/area chart for historical stock prices
- `ScoreRadar` — Radar chart showing 5-dimension technical scores
- `RegimeTimeline` — Timeline visualization of regime changes

**Cards:**
- `StatCard` — Generic metric display (value + label + trend)
- `RegimeBadge` — Color-coded regime indicator
- `RiskGauge` — Visual risk meter with thresholds
- `ScenarioCard` — Bull/Base/Bear case display with probability bars
- `CompositeScoreBar` — Horizontal bar showing 0-100 score

**Tables:**
- `ScreenerTable` — Sortable stock screener results
- `PositionTable` — Editable portfolio positions

**Layout:**
- `Sidebar` — Navigation menu
- `Providers` — React Query setup

### API Client (`lib/api.ts`)

A centralized fetch wrapper that talks to the backend. Organized into 6 groups:
- `marketApi` — prices, fundamentals, macro, news
- `analysisApi` — technical, fundamental, screener, confluence
- `portfolioApi` — positions CRUD, risk, optimization
- `aiApi` — AI analysis, screening, outlook
- `regimeApi` — regime detection, history, macro dashboard
- `healthApi` — backend health check

---

## Running

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

Make sure the backend is running on `http://localhost:8000` first — the frontend needs it to fetch data.

---

## Folder Structure

```
frontend/src/
├── app/                    # Pages (Next.js App Router)
│   ├── page.tsx            # Dashboard
│   ├── screener/           # Stock screener
│   ├── analysis/[ticker]/  # Single stock deep dive
│   ├── portfolio/          # Portfolio manager
│   ├── regime/             # Regime dashboard
│   ├── layout.tsx          # Root layout (sidebar + providers)
│   └── globals.css         # Global styles
├── components/             # Reusable UI pieces
│   ├── cards/              # Score bars, regime badges, stat cards
│   ├── charts/             # Price charts, radar charts, timelines
│   ├── tables/             # Screener and position tables
│   └── layout/             # Sidebar, providers
├── lib/
│   ├── api.ts              # Backend API client
│   └── utils.ts            # Formatting helpers
└── types/
    └── index.ts            # TypeScript interfaces
```

---

## Deployment

Deploy to Vercel for free:

```bash
npm run build    # Verify production build works
vercel deploy    # Deploy to Vercel (requires vercel CLI)
```

Set the `NEXT_PUBLIC_API_URL` environment variable in Vercel to point to your backend URL.
