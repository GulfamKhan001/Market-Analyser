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
- `backend/` — FastAPI backend (Python 3.11+)
- `frontend/` — Next.js 14 frontend (TypeScript, Tailwind)

## Backend
- Entry: `backend/main.py` → FastAPI app
- DB: SQLite via SQLAlchemy ORM (`backend/db/`)
- Data: yfinance, FRED, Finnhub (`backend/ingestion/`)
- Analysis: technical, fundamental, regime detection (`backend/analysis/`)
- Portfolio: CRUD, risk metrics, optimization (`backend/portfolio/`)
- AI: Claude API reasoning layer (`backend/ai/`)
- Routes: `backend/api/routes_*.py`

## Running
- Backend: `cd backend && pip install -r requirements.txt && uvicorn main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`

## Key Decisions
- SQLite for zero-cost single-user setup (swap to PostgreSQL via config)
- AI interprets deterministic analytics, never generates raw predictions
- Half-Kelly position sizing with regime adjustment
- HMM + VIX + Macro combined for regime detection
