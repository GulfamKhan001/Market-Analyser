# Backend — Market Intelligence API

The brain of the platform. A Python API that collects financial data from multiple sources, runs analysis engines on it, manages your portfolio risk, and uses Claude AI to provide structured investment reasoning.

In plain terms: it's the part that does all the thinking.

---

## What It Does

### 1. Data Ingestion — Collecting the Raw Material

The backend automatically pulls data from three free sources:

- **yfinance**: Stock prices (open, high, low, close, volume) and company fundamentals (P/E ratio, revenue growth, ROE, debt levels, etc.). This is the primary data source — it covers every US stock.

- **FRED (Federal Reserve Economic Data)**: Macroeconomic indicators that affect the entire market — GDP growth, inflation (CPI), unemployment rate, Federal Reserve interest rates, Treasury bond yields, and the VIX (market fear gauge).

- **Finnhub**: Latest news headlines for each stock, with a keyword-based sentiment score (-1.0 = very negative, +1.0 = very positive).

A **scheduler** (APScheduler) runs automatically every day at 9:00 PM UTC (4:00 PM US Eastern, right after market close) to refresh everything.

### 2. Technical Analysis — Reading the Charts

For each stock, the system computes **18+ technical indicators** using the `ta` library:

| Category | Indicators | What They Measure |
|----------|-----------|-------------------|
| **Trend** | SMA (20/50/200), EMA (12/26), ADX, MACD | Is the stock going up, down, or sideways? How strong is the trend? |
| **Momentum** | RSI, Stochastic K/D, Williams %R, ROC | Is the stock overbought or oversold? Is momentum accelerating? |
| **Volatility** | Bollinger Bands, ATR | How wild are the price swings? Is a breakout coming? |
| **Volume** | OBV, Volume SMA Ratio | Are big players buying or selling? Is volume confirming the move? |

Each category gets a sub-score (0-100), and they're combined into a **composite score** with these weights:
- Trend: 30% (strongest predictor of future direction)
- Momentum: 25% (confirms trend strength)
- Volatility: 20% (times entry/exit)
- Volume: 15% (validates conviction behind moves)
- Pattern: 10% (candlestick patterns — least reliable alone)

This analysis runs on **three timeframes** — daily, weekly, and monthly — and a confluence score rewards stocks where all timeframes agree.

### 3. Fundamental Analysis — Is the Company Actually Good?

Checks the company's financial health and growth:

| Factor | Metrics | Weight |
|--------|---------|--------|
| **Value** | P/E, P/B, P/S vs sector median | 25% |
| **Quality** | ROE, ROA, Debt/Equity, Current Ratio, Free Cash Flow | 30% |
| **Growth** | Revenue growth, Earnings growth, PEG ratio | 30% |
| **Dividend** | Dividend yield | 15% |

Quality and Growth are weighted highest because cheap stocks with bad fundamentals are "value traps" — they're cheap for a reason.

### 4. Market Regime Detection — What Mood Is the Market In?

Three independent systems vote on the current market environment:

**Hidden Markov Model (HMM)** — A statistical model that looks at S&P 500 daily returns and VIX changes to identify hidden "states" the market is in. Trained on ~2 years of data, it classifies the market as Bull, Sideways, or Bear. The math is complex but the idea is simple: markets move between invisible states, and this model detects which state we're in right now.

**VIX Rules** — The VIX (Volatility Index) is Wall Street's "fear gauge." Below 15 = calm (risk on). 15-25 = normal. 25-35 = nervous (risk off). Above 35 = crisis mode.

**Macro Rules** — Checks three economic signals:
- Is the yield curve inverted? (historically predicts recessions)
- Is the Fed raising or cutting interest rates?
- Is unemployment rising or falling?

These three votes are combined (HMM 40%, VIX 35%, Macro 25%) into a final label: **RISK_ON**, **NEUTRAL**, **RISK_OFF**, or **CRISIS**. This label adjusts position sizing and strategy recommendations across the entire platform.

### 5. Portfolio Management — Tracking Your Money

- Add, edit, and delete stock positions manually
- Tracks unrealized profit/loss and sector allocation
- Computes comprehensive risk metrics:
  - **VaR (Value at Risk)**: "In the worst 5% of days, you'd lose at least X%"
  - **CVaR (Expected Shortfall)**: "In those worst days, the average loss would be X%"
  - **Max Drawdown**: Worst peak-to-trough decline
  - **Sharpe Ratio**: Return per unit of risk (higher = better)
  - **Sortino Ratio**: Like Sharpe but only penalizes downside volatility
  - **Beta**: How much your portfolio moves vs the S&P 500 (1.0 = same, >1.0 = more volatile)
  - **Correlation Matrix**: Which stocks move together
  - **Sector HHI**: How concentrated you are in one sector

### 6. Position Sizing — How Much to Bet

**Kelly Criterion**: A mathematical formula that calculates the optimal bet size based on your win rate and average win/loss. We use **half-Kelly** (bet half of what the math says) because:
- Full Kelly assumes perfect probability estimates (we don't have those)
- Half-Kelly sacrifices ~25% of growth but cuts volatility by ~50%

The Kelly suggestion is then **adjusted by regime**:
- RISK_ON: 100% of Kelly suggestion
- NEUTRAL: 75%
- RISK_OFF: 50%
- CRISIS: 25%

And capped at 10% of portfolio per position (never put all eggs in one basket).

**Mean-Variance Optimization**: Finds the portfolio allocation that maximizes the Sharpe Ratio (best risk-adjusted return) using scipy's optimizer.

### 7. AI Reasoning — Making Sense of It All

All the deterministic data (scores, indicators, regime, risk) gets packaged into a structured prompt and sent to **Claude** (Anthropic's AI). Claude returns:

- **Bull/Base/Bear scenarios** with probability estimates (must sum to 1.0)
- **Risk factors** grounded in the actual data
- **Max drawdown estimate**
- **Position size suggestion**
- **Confidence score**

The AI never generates predictions from nothing — it only interprets the numbers the system already computed. Two models are used:
- **Claude Haiku**: Fast and cheap, used for batch screening
- **Claude Sonnet**: Smarter, used for deep single-stock analysis

Results are cached for 24 hours (market data doesn't change intraday for daily strategies).

---

## API Endpoints

| Group | Endpoints | Purpose |
|-------|----------|---------|
| `/market/` | 6 endpoints | Fetch prices, fundamentals, macro data, news, trigger refreshes |
| `/analysis/` | 5 endpoints | Technical analysis, fundamental scoring, screener, confluence |
| `/portfolio/` | 10 endpoints | CRUD positions, risk metrics, optimization, CSV import |
| `/ai/` | 3 endpoints | AI single-stock analysis, batch screening, market outlook |
| `/regime/` | 4 endpoints | Current regime, history, macro dashboard, force refresh |
| `/health` | 1 endpoint | Health check |

Full interactive API docs available at `http://localhost:8000/docs` (Swagger UI).

---

## External Libraries and Why

| Library | What It Does | Why This One |
|---------|-------------|-------------|
| **FastAPI** | Web framework | Fastest Python API framework, auto-generates docs, async support |
| **SQLAlchemy** | Database ORM | Industry standard, supports SQLite now and PostgreSQL later |
| **pandas** | Data manipulation | The standard for financial data processing in Python |
| **ta** | Technical indicators | Stable library with all standard indicators, works on Python 3.10+ |
| **hmmlearn** | Hidden Markov Models | Lightweight HMM implementation for regime detection |
| **scipy** | Optimization | Mean-variance portfolio optimization (SLSQP solver) |
| **scikit-learn** | Machine learning utilities | Used alongside hmmlearn for data preprocessing |
| **APScheduler** | Task scheduling | Runs inside the FastAPI process (no separate worker needed) |
| **anthropic** | Claude API client | Official SDK for AI reasoning |
| **yfinance** | Yahoo Finance data | Free, unlimited stock data (unofficial but widely used) |
| **fredapi** | FRED data | Official Python client for Federal Reserve data |
| **finnhub-python** | News data | Free tier with 60 req/min for financial news |

---

## Database

SQLite with 9 tables:

| Table | Rows (typical) | Purpose |
|-------|----------------|---------|
| `stock_prices` | 3,000+ | Daily OHLCV for all tracked stocks |
| `fundamentals` | 15+ | Latest financials per stock |
| `macro_indicators` | 1,700+ | Economic data (GDP, CPI, VIX, yields, etc.) |
| `technical_signals` | 45+ | Computed indicator scores per stock per timeframe |
| `regime_states` | 1+ per day | Market regime history |
| `portfolio_positions` | User-defined | Your stock holdings |
| `portfolio_snapshots` | 1 per day | Daily portfolio metrics |
| `ai_analyses` | Cached | AI reasoning results (24hr TTL) |
| `news_sentiment` | 2,000+ | News headlines with sentiment scores |

**Why SQLite?** Zero cost, zero setup, single file. Since this is a single-user app, there are no concurrency issues. The ORM layer (SQLAlchemy) means switching to PostgreSQL later is just a config change.

---

## Running

```bash
cd backend
pip install -r requirements.txt

# Set environment variables in .env
uvicorn main:app --reload --port 8000
```

The server starts, creates the database, and begins the scheduler. First run will have an empty database — hit `/market/refresh/{ticker}` endpoints to populate it, or wait for the scheduler to run at 9 PM UTC.
