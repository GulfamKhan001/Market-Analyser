from sqlalchemy import (
    Column, Integer, Float, String, Date, DateTime, Text, JSON,
    UniqueConstraint, Index,
)
from datetime import datetime, date

from db.database import Base


class StockPrice(Base):
    __tablename__ = "stock_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False, index=True)
    date = Column(Date, nullable=False)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    adj_close = Column(Float)
    volume = Column(Integer)

    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_ticker_date"),
        Index("ix_ticker_date", "ticker", "date"),
    )


class Fundamental(Base):
    __tablename__ = "fundamentals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False, index=True)
    date_fetched = Column(Date, nullable=False, default=date.today)
    market_cap = Column(Float)
    pe_ratio = Column(Float)
    pb_ratio = Column(Float)
    ps_ratio = Column(Float)
    peg_ratio = Column(Float)
    ev_to_ebitda = Column(Float)
    roe = Column(Float)
    roa = Column(Float)
    debt_to_equity = Column(Float)
    current_ratio = Column(Float)
    free_cash_flow = Column(Float)
    revenue_growth = Column(Float)
    earnings_growth = Column(Float)
    dividend_yield = Column(Float)
    sector = Column(String(100))
    industry = Column(String(200))


class MacroIndicator(Base):
    __tablename__ = "macro_indicators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    indicator_name = Column(String(50), nullable=False, index=True)
    date = Column(Date, nullable=False)
    value = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("indicator_name", "date", name="uq_indicator_date"),
    )


class TechnicalSignal(Base):
    __tablename__ = "technical_signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False, index=True)
    date = Column(Date, nullable=False)
    timeframe = Column(String(10), default="daily")  # daily/weekly/monthly

    # Momentum
    rsi = Column(Float)
    stochastic_k = Column(Float)
    stochastic_d = Column(Float)
    williams_r = Column(Float)
    roc = Column(Float)

    # Trend
    macd = Column(Float)
    macd_signal = Column(Float)
    macd_hist = Column(Float)
    adx = Column(Float)
    sma_20 = Column(Float)
    sma_50 = Column(Float)
    sma_200 = Column(Float)
    ema_12 = Column(Float)
    ema_26 = Column(Float)

    # Volatility
    bb_upper = Column(Float)
    bb_middle = Column(Float)
    bb_lower = Column(Float)
    atr = Column(Float)

    # Volume
    obv = Column(Float)
    volume_sma_ratio = Column(Float)

    # Composite
    composite_score = Column(Float)
    trend_score = Column(Float)
    momentum_score = Column(Float)
    volatility_score = Column(Float)
    volume_score = Column(Float)

    __table_args__ = (
        UniqueConstraint("ticker", "date", "timeframe", name="uq_tech_ticker_date_tf"),
    )


class RegimeState(Base):
    __tablename__ = "regime_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    regime_label = Column(String(20), nullable=False)  # RISK_ON, NEUTRAL, RISK_OFF, CRISIS
    confidence = Column(Float)
    vix_regime = Column(String(20))
    yield_curve_state = Column(String(20))
    breadth_score = Column(Float)
    hmm_state = Column(Integer)


class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False)
    entry_date = Column(Date, nullable=False)
    entry_price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=False)
    current_price = Column(Float)
    unrealized_pnl = Column(Float)
    sector = Column(String(100))
    position_type = Column(String(10), default="long")  # long/short/cash
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, unique=True)
    total_value = Column(Float)
    daily_return = Column(Float)
    drawdown = Column(Float)
    var_95 = Column(Float)
    cvar_95 = Column(Float)
    sharpe_ratio = Column(Float)
    sortino_ratio = Column(Float)
    beta = Column(Float)
    sector_allocations_json = Column(JSON)


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False, index=True)
    date = Column(Date, nullable=False, default=date.today)
    analysis_type = Column(String(20), default="standard")  # standard/deep/screening
    model_used = Column(String(50))

    bull_probability = Column(Float)
    bull_target = Column(String(20))
    bull_thesis = Column(Text)

    base_probability = Column(Float)
    base_target = Column(String(20))
    base_thesis = Column(Text)

    bear_probability = Column(Float)
    bear_target = Column(String(20))
    bear_thesis = Column(Text)

    risk_factors_json = Column(JSON)
    drawdown_estimate = Column(String(20))
    position_size_suggestion = Column(Float)
    reasoning_text = Column(Text)
    confidence_score = Column(Float)
    timeframe = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsSentiment(Base):
    __tablename__ = "news_sentiment"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), nullable=False, index=True)
    date = Column(DateTime, nullable=False)
    headline = Column(Text, nullable=False)
    source = Column(String(100))
    url = Column(Text)
    sentiment_score = Column(Float)
    relevance_score = Column(Float)
    summary = Column(Text)
