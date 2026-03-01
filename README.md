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
|              FastAPI Backend                       |
|  Ingestion | Analysis | Portfolio | AI Reasoning   |
+--------+--------+---------+----------+------------+
         |        |         |          |
     yfinance   FRED     Finnhub    Claude AI
     (prices)  (macro)   (news)    (reasoning)
         |        |         |          |
         +--------+---------+----------+
                  |
            SQLite Database
```

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14, React, Tailwind CSS | Fast, modern UI framework with server-side rendering |
| Backend | FastAPI (Python) | High-performance Python API, perfect for data science workloads |
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
- **Hidden Markov Model (HMM)**: Statistically detects Bull/Sideways/Bear states from S&P 500 returns
- **VIX Analysis**: Real-time fear gauge classification (Low/Normal/High/Crisis)
- **Macro Indicators**: Yield curve shape, Fed Funds direction, unemployment trends
- **Combined Signal**: Weighted vote across all three methods produces RISK_ON, NEUTRAL, RISK_OFF, or CRISIS

### Portfolio Management
- **Position Tracking**: Add stocks manually with entry price, quantity, date
- **Risk Metrics**: Value at Risk (VaR), Conditional VaR, Max Drawdown, Sharpe Ratio, Sortino Ratio
- **Portfolio Beta**: How your portfolio moves relative to the S&P 500
- **Correlation Matrix**: Shows which of your stocks move together (less correlation = better diversification)
- **Kelly Position Sizing**: Mathematically optimal bet sizing, halved for safety, adjusted by market regime
- **Mean-Variance Optimization**: Finds the allocation that maximizes return per unit of risk

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
| **yfinance** | Stock prices (OHLCV), company fundamentals, sector info | Free |
| **FRED API** | GDP, CPI, unemployment, Fed Funds rate, Treasury yields, VIX | Free (API key required) |
| **Finnhub** | Company news headlines with sentiment scoring | Free tier (60 req/min) |
| **Claude API** | AI-powered analysis and reasoning | Pay-per-use (~$0.50-2/day) |

---

## Tech Stack Summary

**Backend (Python):**
FastAPI, SQLAlchemy, Pandas, NumPy, SciPy, hmmlearn, scikit-learn, ta (technical analysis), APScheduler, Anthropic SDK

**Frontend (TypeScript):**
Next.js 14, React 19, Tailwind CSS, Recharts, TanStack Query, Lucide Icons, TradingView Lightweight Charts

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- API keys: FRED, Finnhub, Anthropic (Claude)

### Backend
```bash
cd backend
pip install -r requirements.txt

# Create .env file with your API keys
cat > .env << EOF
FRED_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
DATABASE_URL=sqlite:///./market_analyser.db
SCHEDULER_ENABLED=true
EOF

uvicorn main:app --reload
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dashboard available at http://localhost:3000
```

---

## Project Structure

```
Market Analyser/
├── backend/                 # FastAPI Python backend
│   ├── ai/                  # Claude API reasoning layer
│   ├── analysis/            # Technical, fundamental, regime engines
│   ├── api/                 # REST API route handlers
│   ├── db/                  # Database models and connection
│   ├── ingestion/           # Data fetching (yfinance, FRED, Finnhub)
│   ├── portfolio/           # Portfolio CRUD, risk, optimization
│   ├── main.py              # App entry point
│   └── config.py            # Settings and configuration
├── frontend/                # Next.js React frontend
│   └── src/
│       ├── app/             # Pages (dashboard, screener, portfolio, regime, analysis)
│       ├── components/      # UI components (charts, cards, tables)
│       ├── lib/             # API client and utilities
│       └── types/           # TypeScript type definitions
└── README.md                # This file
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
