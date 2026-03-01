"""
Portfolio risk analytics — VaR, CVaR, drawdown, Sharpe, Sortino, beta,
correlation matrix, and sector concentration.
"""

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import func

from config import get_settings
from db.database import SessionLocal
from db.models import (
    PortfolioPosition, PortfolioSnapshot, StockPrice,
    MacroIndicator, RegimeState,
)

logger = logging.getLogger(__name__)
settings = get_settings()

TRADING_DAYS_PER_YEAR = 252


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_portfolio_returns(session: Session, days: int = 252) -> pd.Series:
    """
    Build a daily portfolio return series from historical stock prices,
    weighted by each position's market value.

    Returns:
        pd.Series indexed by date with daily portfolio returns.
    """
    positions = (
        session.query(PortfolioPosition)
        .all()
    )
    if not positions:
        return pd.Series(dtype=float)

    start_date = date.today() - timedelta(days=int(days * 1.5))

    # Collect per-ticker weights (market-value weight based on entry)
    ticker_qty: dict[str, float] = {}
    ticker_entry_price: dict[str, float] = {}
    for p in positions:
        t = p.ticker
        ticker_qty[t] = ticker_qty.get(t, 0.0) + p.quantity
        # Use entry_price as a fallback weight base
        ticker_entry_price.setdefault(t, p.entry_price)

    tickers = list(ticker_qty.keys())

    # Fetch prices from DB
    prices_q = (
        session.query(StockPrice.ticker, StockPrice.date, StockPrice.adj_close)
        .filter(
            StockPrice.ticker.in_(tickers),
            StockPrice.date >= start_date,
        )
        .order_by(StockPrice.date)
        .all()
    )

    if not prices_q:
        return pd.Series(dtype=float)

    # Pivot into a DataFrame: rows=date, columns=ticker
    df = pd.DataFrame(prices_q, columns=["ticker", "date", "adj_close"])
    price_matrix = df.pivot(index="date", columns="ticker", values="adj_close")
    price_matrix.sort_index(inplace=True)
    price_matrix.dropna(how="all", inplace=True)
    price_matrix.ffill(inplace=True)

    # Daily returns per ticker
    returns_matrix = price_matrix.pct_change().dropna(how="all")

    # Compute market-value weights
    total_value = sum(
        ticker_qty[t] * (price_matrix[t].iloc[-1] if t in price_matrix.columns else ticker_entry_price[t])
        for t in tickers
        if t in price_matrix.columns
    )

    if total_value == 0:
        return pd.Series(dtype=float)

    weights: dict[str, float] = {}
    for t in tickers:
        if t not in price_matrix.columns:
            continue
        mv = ticker_qty[t] * price_matrix[t].iloc[-1]
        weights[t] = mv / total_value

    # Weighted portfolio return
    portfolio_returns = pd.Series(0.0, index=returns_matrix.index)
    for t, w in weights.items():
        if t in returns_matrix.columns:
            portfolio_returns += returns_matrix[t].fillna(0.0) * w

    # Trim to requested number of trading days
    portfolio_returns = portfolio_returns.iloc[-days:]
    return portfolio_returns


def _compute_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Historical simulation VaR.

    Returns the loss threshold at the given confidence level (as a positive
    number representing percent loss).
    """
    if returns.empty:
        return 0.0
    cutoff = returns.quantile(1 - confidence)
    return float(-cutoff)


# ---------------------------------------------------------------------------
# Main risk computation
# ---------------------------------------------------------------------------

def compute_risk_metrics(session: Session) -> dict:
    """
    Compute a comprehensive set of portfolio risk metrics.

    Returns:
        dict with keys: var_95, var_99, cvar_95, cvar_99, max_drawdown,
        sharpe_ratio, sortino_ratio, beta, correlation_matrix,
        sector_concentration_hhi.
    """
    returns = _get_portfolio_returns(session, days=TRADING_DAYS_PER_YEAR)

    result: dict = {}

    if returns.empty or len(returns) < 5:
        logger.warning("Insufficient return data for risk metrics")
        return result

    # ---- VaR ----
    var_95 = _compute_var(returns, 0.95)
    var_99 = _compute_var(returns, 0.99)
    result["var_95"] = round(var_95, 6)
    result["var_99"] = round(var_99, 6)

    # ---- CVaR (Expected Shortfall) ----
    cutoff_95 = returns.quantile(0.05)
    tail_95 = returns[returns <= cutoff_95]
    result["cvar_95"] = round(float(-tail_95.mean()), 6) if not tail_95.empty else var_95

    cutoff_99 = returns.quantile(0.01)
    tail_99 = returns[returns <= cutoff_99]
    result["cvar_99"] = round(float(-tail_99.mean()), 6) if not tail_99.empty else var_99

    # ---- Max drawdown ----
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.cummax()
    drawdowns = (cumulative - running_max) / running_max
    result["max_drawdown"] = round(float(drawdowns.min()), 6)

    # ---- Risk-free rate from macro_indicators (fed_funds_rate) ----
    risk_free_annual = 0.0
    latest_ffr = (
        session.query(MacroIndicator)
        .filter(MacroIndicator.indicator_name == "fed_funds_rate")
        .order_by(MacroIndicator.date.desc())
        .first()
    )
    if latest_ffr and latest_ffr.value is not None:
        # The stored value is typically in percent (e.g. 5.33 for 5.33%)
        risk_free_annual = latest_ffr.value / 100.0

    risk_free_daily = risk_free_annual / TRADING_DAYS_PER_YEAR

    # ---- Sharpe ratio (annualized) ----
    excess = returns - risk_free_daily
    if returns.std() != 0:
        sharpe = (excess.mean() / returns.std()) * np.sqrt(TRADING_DAYS_PER_YEAR)
        result["sharpe_ratio"] = round(float(sharpe), 4)
    else:
        result["sharpe_ratio"] = 0.0

    # ---- Sortino ratio (annualized) ----
    downside = returns[returns < risk_free_daily] - risk_free_daily
    downside_std = np.sqrt((downside ** 2).mean()) if len(downside) > 0 else 0.0
    if downside_std != 0:
        sortino = (excess.mean() / downside_std) * np.sqrt(TRADING_DAYS_PER_YEAR)
        result["sortino_ratio"] = round(float(sortino), 4)
    else:
        result["sortino_ratio"] = 0.0

    # ---- Beta vs S&P 500 ----
    result["beta"] = _compute_beta(session, returns)

    # ---- Correlation matrix between holdings ----
    result["correlation_matrix"] = _correlation_matrix(session)

    # ---- Sector concentration (Herfindahl-Hirschman Index) ----
    result["sector_concentration_hhi"] = _sector_hhi(session)

    return result


# ---------------------------------------------------------------------------
# Sub-computations
# ---------------------------------------------------------------------------

def _compute_beta(session: Session, portfolio_returns: pd.Series) -> Optional[float]:
    """Compute portfolio beta relative to S&P 500 (^GSPC / SPY)."""
    if portfolio_returns.empty:
        return None

    start_date = date.today() - timedelta(days=int(TRADING_DAYS_PER_YEAR * 1.5))

    # Try SPY as the benchmark
    bench_prices = (
        session.query(StockPrice.date, StockPrice.adj_close)
        .filter(
            StockPrice.ticker == "SPY",
            StockPrice.date >= start_date,
        )
        .order_by(StockPrice.date)
        .all()
    )

    if not bench_prices or len(bench_prices) < 10:
        return None

    bench_df = pd.DataFrame(bench_prices, columns=["date", "adj_close"])
    bench_df.set_index("date", inplace=True)
    bench_returns = bench_df["adj_close"].pct_change().dropna()

    # Align
    common = portfolio_returns.index.intersection(bench_returns.index)
    if len(common) < 10:
        return None

    pr = portfolio_returns.loc[common]
    br = bench_returns.loc[common]

    cov = np.cov(pr, br)
    if cov[1, 1] == 0:
        return None

    beta = cov[0, 1] / cov[1, 1]
    return round(float(beta), 4)


def _correlation_matrix(session: Session) -> dict:
    """
    Return a correlation matrix between all current holdings as a nested dict.
    """
    positions = session.query(PortfolioPosition).all()
    tickers = list({p.ticker for p in positions})

    if len(tickers) < 2:
        return {}

    start_date = date.today() - timedelta(days=int(TRADING_DAYS_PER_YEAR * 1.5))

    prices_q = (
        session.query(StockPrice.ticker, StockPrice.date, StockPrice.adj_close)
        .filter(
            StockPrice.ticker.in_(tickers),
            StockPrice.date >= start_date,
        )
        .order_by(StockPrice.date)
        .all()
    )

    if not prices_q:
        return {}

    df = pd.DataFrame(prices_q, columns=["ticker", "date", "adj_close"])
    price_matrix = df.pivot(index="date", columns="ticker", values="adj_close")
    price_matrix.sort_index(inplace=True)
    price_matrix.ffill(inplace=True)

    returns_matrix = price_matrix.pct_change().dropna(how="all")
    corr = returns_matrix.corr()

    # Convert to a JSON-friendly nested dict with rounded values
    return {
        t1: {t2: round(float(corr.loc[t1, t2]), 4) for t2 in corr.columns}
        for t1 in corr.index
    }


def _sector_hhi(session: Session) -> float:
    """
    Herfindahl-Hirschman Index of sector concentration.

    HHI ranges from 0 (perfectly diversified) to 10000 (single sector).
    """
    positions = session.query(PortfolioPosition).all()
    if not positions:
        return 0.0

    sector_values: dict[str, float] = {}
    total = 0.0
    for p in positions:
        price = p.current_price if p.current_price else p.entry_price
        mv = price * p.quantity
        sector = p.sector or "Unknown"
        sector_values[sector] = sector_values.get(sector, 0.0) + mv
        total += mv

    if total == 0:
        return 0.0

    hhi = sum((v / total * 100) ** 2 for v in sector_values.values())
    return round(hhi, 2)
