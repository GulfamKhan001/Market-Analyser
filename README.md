# Market Intelligence AI Platform

A full-stack investment intelligence system that combines hard numbers with AI reasoning to help you make smarter stock market decisions. Think of it as your personal Wall Street analyst — it watches the market, crunches the numbers, detects when the market mood shifts, and tells you what it all means in plain language.

---

## What Does This Project Do?

Imagine you want to invest in US stocks but don't have time to stare at charts all day, read every earnings report, or track what the Federal Reserve is doing. This platform does all of that for you:

1. **Watches 15+ stocks automatically** — Pulls live prices, company financials, economic data, and news every day after the US market closes.

2. **Scores every stock from 0 to 100** — Uses 18+ technical indicators (like RSI, MACD, Bollinger Bands) and fundamental metrics (like P/E ratio, ROE, revenue growth) to generate a clear score. Higher score = stronger stock.

3. **Detects the "mood" of the market** — Is the market feeling optimistic (Risk On), nervous (Risk Off), or in full panic mode (Crisis)? The system uses three independent methods to figure this out and adjusts all recommendations accordingly.

4. **Manages your portfolio risk** — Tracks your holdings, calculates how much you could lose in a bad week (Value at Risk), measures diversification, and suggests position sizes so you don't bet too much on one stock.

5. **AI-powered reasoning** — Sends all the hard data to Claude (Anthropic's AI) and gets back a structured analysis: bull case, bear case, probability estimates, risk factors, and suggested actions. No hype, no guessing — just data-driven reasoning.

---

## How It Works (The Simple Version)

```
You open the dashboard
        |
        v
The system has already collected today's data
(prices, earnings, economic indicators, news)
        |
        v
It ran 18+ technical indicators on every stock
and scored them on trend, momentum, volatility, volume
        |
        v
It checked the market regime:
"Is this a good time to be aggressive or defensive?"
        |
        v
It calculated your portfolio risk:
"How exposed am I? How correlated are my holdings?"
        |
        v
AI reads all of this and gives you:
"Here's what I think, here's the probability, here's the risk"
        |
        v
You see it all on a clean dashboard with charts and scores
```

---

## Architecture

```
+---------------------------------------------------+
|              Next.js Frontend                      |
|    Dashboard | Screener | Portfolio | Regime       |
+------------------------+--------------------------+
                         | REST API
+------------------------+--------------------------+
|           Express.js Backend (Node.js)             |
|  Ingestion | Analysis | Portfolio | AI Reasoning   |
+--------+--------+---------+----------+------------+
         |        |         |          |
    yahoo-finance2 FRED    Finnhub   Claude AI
     (prices)    (macro)   (news)   (reasoning)
         |        |         |          |
         +--------+---------+----------+
                  |
           SQLite Database (Prisma ORM)
```

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14, React, Tailwind CSS | Fast, modern UI framework with server-side rendering |
| Backend | Express.js + TypeScript | Full MERN stack alignment, high-performance async API |
| ORM | Prisma | Type-safe database access with migrations and studio |
| Database | SQLite | Zero cost, zero setup, file-based — ideal for single-user |
| AI | Claude API (Anthropic) | Best-in-class reasoning for structured financial analysis |
| Charts | Recharts + TradingView Lightweight Charts | Professional-grade financial charting |

---

## Key Features

### Stock Analysis
- **18+ Technical Indicators**: RSI, MACD, Bollinger Bands, ADX, ATR, OBV, Stochastic, Williams %R, ROC, SMA/EMA (multiple periods)
- **Fundamental Scoring**: P/E, P/B, ROE, ROA, Debt/Equity, Revenue Growth, Dividend Yield
- **Multi-Timeframe**: Daily, Weekly, and Monthly analysis with confluence scoring
- **Stock Screener**: Filter by score, sector, volume — find the best setups fast

### Market Regime Detection
- **Rule-Based Regime Detection**: SMA(50) vs SMA(200) crossover on S&P 500 for trend state
- **VIX Analysis**: Real-time fear gauge classification (Low/Normal/High/Crisis)
- **Macro Indicators**: Yield curve shape, Fed Funds direction, unemployment trends
- **Combined Signal**: Weighted vote across all three methods produces RISK_ON, NEUTRAL, RISK_OFF, or CRISIS

### Portfolio Management
- **Position Tracking**: Add stocks manually or import via CSV/Vested export
- **Risk Metrics**: Value at Risk (VaR), Conditional VaR, Max Drawdown, Sharpe Ratio, Sortino Ratio
- **Portfolio Beta**: How your portfolio moves relative to the S&P 500
- **Correlation Matrix**: Shows which of your stocks move together (less correlation = better diversification)
- **Kelly Position Sizing**: Mathematically optimal bet sizing, halved for safety, adjusted by market regime
- **Monte Carlo Simulation**: GBM with Cholesky-correlated returns, 1000 paths, percentile fan charts
- **Currency Exposure**: USD/INR sensitivity analysis with FX volatility tracking
- **Portfolio Health Score**: Composite 0-100 score from diversification, risk, performance, and balance

### AI Reasoning
- **Scenario Analysis**: Bull/Base/Bear cases with probability estimates
- **Risk Factor Identification**: AI highlights what could go wrong
- **Position Size Suggestions**: Based on your portfolio and current regime
- **Market Outlook**: Big-picture view of where the market is heading
- **No Hallucination**: AI only interprets real data — never generates predictions from nothing

---

## Data Sources

| Source | What It Provides | Cost |
|--------|-----------------|------|
| **yahoo-finance2** | Stock prices (OHLCV), company fundamentals, sector info | Free |
| **FRED API** | GDP, CPI, unemployment, Fed Funds rate, Treasury yields, VIX | Free (API key required) |
| **Finnhub** | Company news headlines with sentiment scoring | Free tier (60 req/min) |
| **Claude API** | AI-powered analysis and reasoning | Pay-per-use (~$0.50-2/day) |

---

## Tech Stack Summary

**Backend (Node.js / TypeScript):**
Express.js, Prisma ORM, Zod, yahoo-finance2, technicalindicators, mathjs, @anthropic-ai/sdk, node-cron, multer, axios, sentiment

**Frontend (TypeScript):**
Next.js 14, React 19, Tailwind CSS, Recharts, TanStack Query, Lucide Icons, TradingView Lightweight Charts

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- API keys: FRED, Finnhub, Anthropic (Claude)

### Backend
```bash
cd backend
npm install

# Create .env file with your API keys
cat > .env << EOF
DATABASE_URL="file:./market_analyser.db"
FRED_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
SCHEDULER_ENABLED=true
EOF

# Initialize database
npx prisma generate
npx prisma db push

# Start dev server
npm run dev
# API available at http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dashboard available at http://localhost:3000
```

---

## API Endpoints (42 total)

### Market Data (`/market`) — 6 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/market/prices/:ticker` | Historical prices (auto-fetches if missing) |
| GET | `/market/fundamentals/:ticker` | Company fundamentals |
| GET | `/market/macro` | Latest macro indicators (GDP, CPI, VIX, etc.) |
| GET | `/market/news/:ticker` | News sentiment for a ticker |
| POST | `/market/refresh/:ticker` | Force refresh all data for a ticker |
| POST | `/market/refresh-macro` | Force refresh macro indicators |

### Analysis (`/analysis`) — 5 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analysis/technical/:ticker` | Technical analysis with 18+ indicators |
| GET | `/analysis/fundamental/:ticker` | Fundamental scoring (value, quality, growth) |
| GET | `/analysis/confluence/:ticker` | Multi-timeframe confluence |
| GET | `/analysis/screener` | Multi-factor stock screener |
| GET | `/analysis/full/:ticker` | Combined technical + fundamental + confluence |

### Portfolio (`/portfolio`) — 24 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/portfolio/positions` | List all positions |
| POST | `/portfolio/positions` | Add a new position |
| PUT | `/portfolio/positions/:id` | Update a position |
| DELETE | `/portfolio/positions/:id` | Delete a position |
| POST | `/portfolio/refresh-prices` | Update current prices |
| GET | `/portfolio/summary` | Portfolio summary with allocations |
| GET | `/portfolio/risk` | Risk metrics (VaR, Sharpe, beta, etc.) |
| GET | `/portfolio/optimize` | Optimized allocation suggestions |
| GET | `/portfolio/position-size/:ticker` | Kelly-based position sizing |
| POST | `/portfolio/snapshot` | Take a portfolio snapshot |
| POST | `/portfolio/import-csv` | Import positions from CSV |
| POST | `/portfolio/import-vested` | Import from Vested CSV export |
| GET | `/portfolio/transactions` | Transaction history |
| GET | `/portfolio/cash` | Current cash balance |
| POST | `/portfolio/cash/deposit` | Deposit cash |
| POST | `/portfolio/cash/withdraw` | Withdraw cash |
| GET | `/portfolio/monte-carlo` | Monte Carlo simulation |
| GET | `/portfolio/stress-test` | Default stress test (-10%, -20%, -30%) |
| POST | `/portfolio/stress-test` | Custom stress test scenarios |
| GET | `/portfolio/concentration` | Position concentration (HHI, top holdings) |
| GET | `/portfolio/correlation-clusters` | Correlation-based clusters |
| GET | `/portfolio/currency` | USD/INR currency exposure |
| GET | `/portfolio/twr` | Time-weighted return |
| GET | `/portfolio/health` | Portfolio health score (0-100) |

### AI Reasoning (`/ai`) — 3 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/analyze/:ticker` | AI scenario analysis (bull/base/bear) |
| POST | `/ai/screen` | Batch AI screening with actions |
| GET | `/ai/outlook` | AI market outlook |

### Regime Detection (`/regime`) — 4 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/regime/current` | Current market regime |
| GET | `/regime/history` | Regime history over time |
| GET | `/regime/macro-dashboard` | Macro indicators dashboard |
| POST | `/regime/refresh` | Force refresh regime detection |

---

## Project Structure

```
Market Analyser/
├── backend/               # Express.js + TypeScript backend
│   ├── prisma/
│   │   └── schema.prisma       # 11 database models
│   ├── src/
│   │   ├── ai/                 # Claude API reasoning layer
│   │   │   ├── reasoner.ts     # AIReasoner class with caching
│   │   │   ├── schemas.ts      # Zod validation schemas
│   │   │   └── prompts.ts      # Prompt templates
│   │   ├── analysis/           # Technical, fundamental, regime engines
│   │   │   ├── technical.ts    # 18+ indicators, 5-dimension scoring
│   │   │   ├── fundamental.ts  # Value/quality/growth/dividend scoring
│   │   │   ├── regime.ts       # Rule-based regime detection
│   │   │   ├── screener.ts     # Multi-factor stock screener
│   │   │   └── indicators.ts   # Multi-timeframe confluence
│   │   ├── db/                 # Database layer
│   │   │   ├── client.ts       # Prisma client singleton
│   │   │   └── encryption.ts   # AES-256-GCM field encryption
│   │   ├── ingestion/          # Data fetching
│   │   │   ├── yahoo.ts        # yahoo-finance2 (prices + fundamentals)
│   │   │   ├── fred.ts         # FRED REST API (macro indicators)
│   │   │   ├── finnhub.ts      # Finnhub REST API (news + sentiment)
│   │   │   └── scheduler.ts    # node-cron daily refresh
│   │   ├── middleware/
│   │   │   └── auth.ts         # API key authentication
│   │   ├── portfolio/          # Portfolio management + analytics
│   │   │   ├── manager.ts      # Position CRUD, CSV import, TWR
│   │   │   ├── risk.ts         # VaR, Sharpe, beta, correlation, stress test
│   │   │   ├── optimizer.ts    # Kelly sizing, allocation optimization
│   │   │   ├── monteCarlo.ts   # GBM simulation with Cholesky correlation
│   │   │   ├── currency.ts     # USD/INR exposure analysis
│   │   │   ├── health.ts       # Composite health score 0-100
│   │   │   └── transactions.ts # Transaction audit + cash ledger
│   │   ├── routes/             # Express route handlers
│   │   │   ├── market.ts       # 6 endpoints
│   │   │   ├── analysis.ts     # 5 endpoints
│   │   │   ├── portfolio.ts    # 24 endpoints
│   │   │   ├── ai.ts           # 3 endpoints
│   │   │   └── regime.ts       # 4 endpoints
│   │   ├── utils/
│   │   │   ├── math.ts         # Statistical helpers (std, mean, Cholesky, etc.)
│   │   │   └── format.ts       # Currency formatting, date utils
│   │   ├── types/
│   │   │   └── yahoo-finance2.d.ts
│   │   ├── config.ts           # Zod-validated env vars
│   │   └── index.ts            # Express app entry point
│   ├── package.json
│   ├── tsconfig.json
│   ├── nodemon.json
│   └── .env
├── frontend/                   # Next.js React frontend
│   └── src/
│       ├── app/                # Pages (dashboard, screener, portfolio, regime, analysis)
│       ├── components/         # UI components (charts, cards, tables)
│       ├── lib/                # API client and utilities
│       └── types/              # TypeScript type definitions
└── README.md
```

---

## Who Is This For?

This was built for a long-term investor based in India who wants to invest in US equities. The system is designed around these principles:

- **Capital preservation first** — Risk management over prediction
- **No hype stocks** — Data-driven decisions only
- **Macro-aware** — Adjusts strategy based on economic conditions
- **10+ year horizon** — Beat the S&P 500 with controlled volatility

---

## License

Private project. Not intended for redistribution.
