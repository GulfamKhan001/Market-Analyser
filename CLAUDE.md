# Market Intelligence AI Platform
Project: US Market Intelligence AI
Mission

Build a disciplined AI-powered US equity investment intelligence system focused on risk-adjusted outperformance over S&P 500 long-term.

Investor Profile

Location: India
Goal: Long-term capital growth
Risk tolerance: Moderate to high
Time horizon: 10+ years
Target: Beat S&P 500 with controlled volatility

Core Principles

Capital preservation first

Risk management over prediction

No hype stocks

No speculative memecoin behavior

Macro-aware investing

Data-driven decision making

Required Capabilities
1. Market Regime Detection

Fed cycle analysis

Yield curve structure

Inflation trend

Liquidity conditions

2. Stock Evaluation Model

Technical trend

Earnings consistency

Revenue growth

Margin expansion

Debt health

Institutional ownership

Relative strength vs sector

3. Risk Engine

Portfolio beta

Correlation clustering

Sector exposure

Currency exposure (USD/INR)

Monte Carlo simulation

4. AI Decision Model

Probabilistic outputs

Structured analysis only

No hype language

Scenario modeling

Output Format Requirements

Always respond in structured format:

Macro overview

Sector strength

Stock analysis

Risk factors

Probability distribution

Suggested action

## Project Structure
- `backend/` — Express.js + TypeScript backend (Node.js)
- `frontend/` — Next.js 14 frontend (TypeScript, Tailwind)

## Backend (Node.js)
- Entry: `backend/src/index.ts` → Express app
- DB: SQLite via Prisma ORM (`backend/prisma/schema.prisma`)
- Config: Zod-validated env vars (`backend/src/config.ts`)
- Data: yahoo-finance2, FRED REST API, Finnhub REST API (`backend/src/ingestion/`)
- Analysis: technical, fundamental, regime detection (`backend/src/analysis/`)
- Portfolio: CRUD, risk metrics, optimization, Monte Carlo (`backend/src/portfolio/`)
- AI: Claude API reasoning layer via @anthropic-ai/sdk (`backend/src/ai/`)
- Routes: `backend/src/routes/*.ts` (42 endpoints across 5 files)
- Encryption: AES-256-GCM transparent field encryption via Prisma middleware (`backend/src/db/encryption.ts`)
- Scheduler: node-cron daily refresh (`backend/src/ingestion/scheduler.ts`)

## Running
- Backend: `cd backend && npm install && npx prisma generate && npx prisma db push && npm run dev`
- Frontend: `cd frontend && npm install && npm run dev`
- Tests: `cd backend && npm test`

## Key Commands
- `npm run dev` — Start dev server with hot reload (nodemon + ts-node)
- `npm run build` — Compile TypeScript to `dist/`
- `npm start` — Run compiled production build
- `npx prisma studio` — Visual database browser
- `npx prisma db push` — Sync schema to database
- `npm test` — Run Vitest test suite

## Key Decisions
- SQLite for zero-cost single-user setup (swap to PostgreSQL by changing DATABASE_URL)
- Prisma ORM for type-safe database access with transparent encryption middleware
- AI interprets deterministic analytics, never generates raw predictions
- Half-Kelly position sizing with regime adjustment
- Rule-based regime detection: SMA(50) vs SMA(200) cross + VIX bands + macro signals (replaces Python HMM)
- Zod for runtime validation (replaces Pydantic)
- yahoo-finance2 for market data (replaces yfinance)
- Custom TypeScript math utils for statistics (replaces numpy/scipy)

## Environment Variables
Required in `backend/.env`:
- `DATABASE_URL` — Prisma connection string (default: `file:./market_analyser.db`)
- `FRED_API_KEY` — FRED API key for macro data
- `FINNHUB_API_KEY` — Finnhub API key for news
- `ANTHROPIC_API_KEY` — Claude API key for AI analysis
- `DB_ENCRYPTION_KEY` — 32-byte hex key for field encryption (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `APP_API_KEY` — Optional API key for endpoint authentication (leave empty to disable)
