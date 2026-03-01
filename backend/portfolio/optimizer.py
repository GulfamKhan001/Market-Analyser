"""
Portfolio position sizing and allocation optimization.

Combines Kelly criterion, regime-based adjustment, and mean-variance
optimization via scipy.
"""

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import numpy as np
from scipy.optimize import minimize
from sqlalchemy.orm import Session

from config import get_settings
from db.database import SessionLocal
from db.models import (
    PortfolioPosition, PortfolioSnapshot, StockPrice,
    MacroIndicator, RegimeState,
)

logger = logging.getLogger(__name__)
settings = get_settings()

TRADING_DAYS_PER_YEAR = 252

# Regime multipliers for position sizing
REGIME_FACTORS: dict[str, float] = {
    "RISK_ON": 1.00,
    "NEUTRAL": 0.75,
    "RISK_OFF": 0.50,
    "CRISIS": 0.25,
}


# ---------------------------------------------------------------------------
# Kelly criterion
# ---------------------------------------------------------------------------

def kelly_position_size(
    win_prob: float,
    avg_win: float,
    avg_loss: float,
    portfolio_value: float,
    kelly_fraction: float = 0.5,
) -> float:
    """
    Compute the (fractional) Kelly position size in dollar terms.

    Uses the formula:
        f* = (p / a) - (q / b)
    where
        p = win probability, q = 1 - p,
        b = average win (as ratio), a = average loss (as ratio, positive).

    Args:
        win_prob: Probability of a winning trade (0-1).
        avg_win: Average win as a positive ratio (e.g. 0.08 for 8%).
        avg_loss: Average loss as a positive ratio (e.g. 0.04 for 4%).
        portfolio_value: Total portfolio value in dollars.
        kelly_fraction: Fraction of Kelly to use (default 0.5 = half-Kelly).

    Returns:
        Suggested dollar position size (non-negative).
    """
    if avg_loss <= 0 or avg_win <= 0 or portfolio_value <= 0:
        return 0.0

    q = 1.0 - win_prob
    # Kelly fraction: f* = p/a - q/b  (where b = avg_win, a = avg_loss)
    kelly_f = (win_prob / avg_loss) - (q / avg_win)

    # Apply fractional Kelly and floor at zero
    kelly_f = max(kelly_f * kelly_fraction, 0.0)

    return round(kelly_f * portfolio_value, 2)


# ---------------------------------------------------------------------------
# Regime adjustment
# ---------------------------------------------------------------------------

def regime_adjusted_size(base_size: float, regime_label: str) -> float:
    """
    Scale a base position size by the current market regime.

    Regime multipliers:
        RISK_ON  -> 100%
        NEUTRAL  -> 75%
        RISK_OFF -> 50%
        CRISIS   -> 25%
    """
    factor = REGIME_FACTORS.get(regime_label, 0.75)
    return round(base_size * factor, 2)


# ---------------------------------------------------------------------------
# Combined suggestion
# ---------------------------------------------------------------------------

def suggest_position_size(ticker: str, session: Session) -> dict:
    """
    Suggest a position size for *ticker* by combining Kelly criterion,
    regime adjustment, and a maximum position cap.

    The Kelly inputs (win_prob, avg_win, avg_loss) are estimated from
    the ticker's historical daily returns.

    Returns:
        dict with keys: suggested_size, kelly_raw, regime_factor,
        regime_label, max_position_cap.
    """
    # --- Gather portfolio value ---
    positions = session.query(PortfolioPosition).all()
    portfolio_value = 0.0
    for p in positions:
        price = p.current_price if p.current_price else p.entry_price
        portfolio_value += price * p.quantity

    if portfolio_value <= 0:
        return {
            "suggested_size": 0.0,
            "kelly_raw": 0.0,
            "regime_factor": 0.0,
            "regime_label": "UNKNOWN",
            "max_position_cap": 0.0,
        }

    # --- Historical stats for the ticker ---
    start_date = date.today() - timedelta(days=int(TRADING_DAYS_PER_YEAR * 1.5))
    prices = (
        session.query(StockPrice.adj_close)
        .filter(StockPrice.ticker == ticker, StockPrice.date >= start_date)
        .order_by(StockPrice.date)
        .all()
    )

    closes = pd.Series([p.adj_close for p in prices if p.adj_close is not None])
    if len(closes) < 20:
        logger.warning("Insufficient price history for %s", ticker)
        return {
            "suggested_size": 0.0,
            "kelly_raw": 0.0,
            "regime_factor": 0.0,
            "regime_label": "UNKNOWN",
            "max_position_cap": round(portfolio_value * settings.max_position_pct, 2),
        }

    daily_returns = closes.pct_change().dropna()
    wins = daily_returns[daily_returns > 0]
    losses = daily_returns[daily_returns < 0]

    win_prob = len(wins) / len(daily_returns) if len(daily_returns) > 0 else 0.5
    avg_win = float(wins.mean()) if len(wins) > 0 else 0.01
    avg_loss = float(-losses.mean()) if len(losses) > 0 else 0.01

    kelly_raw = kelly_position_size(
        win_prob=win_prob,
        avg_win=avg_win,
        avg_loss=avg_loss,
        portfolio_value=portfolio_value,
        kelly_fraction=settings.kelly_fraction,
    )

    # --- Current regime ---
    latest_regime = (
        session.query(RegimeState)
        .order_by(RegimeState.date.desc())
        .first()
    )
    regime_label = latest_regime.regime_label if latest_regime else "NEUTRAL"
    regime_factor = REGIME_FACTORS.get(regime_label, 0.75)

    adjusted = regime_adjusted_size(kelly_raw, regime_label)

    # --- Apply max position cap ---
    max_cap = portfolio_value * settings.max_position_pct
    suggested = min(adjusted, max_cap)

    return {
        "suggested_size": round(suggested, 2),
        "kelly_raw": round(kelly_raw, 2),
        "regime_factor": regime_factor,
        "regime_label": regime_label,
        "max_position_cap": round(max_cap, 2),
    }


# ---------------------------------------------------------------------------
# Mean-variance optimization
# ---------------------------------------------------------------------------

def optimize_allocation(session: Session) -> dict:
    """
    Basic Markowitz mean-variance portfolio optimization using scipy.

    Finds the tangency portfolio (maximum Sharpe ratio) subject to:
        - Weights sum to 1
        - Each weight between 0 and max_position_pct

    Returns:
        dict mapping ticker -> suggested weight (0-1), plus metadata.
    """
    positions = session.query(PortfolioPosition).all()
    tickers = sorted({p.ticker for p in positions})

    if len(tickers) < 2:
        # Cannot optimise with fewer than 2 assets
        if tickers:
            return {"weights": {tickers[0]: 1.0}, "status": "single_asset"}
        return {"weights": {}, "status": "no_positions"}

    # --- Build return matrix ---
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
        return {"weights": {}, "status": "no_price_data"}

    df = pd.DataFrame(prices_q, columns=["ticker", "date", "adj_close"])
    price_matrix = df.pivot(index="date", columns="ticker", values="adj_close")
    price_matrix.sort_index(inplace=True)
    price_matrix.ffill(inplace=True)
    price_matrix.dropna(axis=1, how="any", inplace=True)

    available_tickers = list(price_matrix.columns)
    if len(available_tickers) < 2:
        return {"weights": {}, "status": "insufficient_price_data"}

    returns_matrix = price_matrix.pct_change().dropna()
    if len(returns_matrix) < 20:
        return {"weights": {}, "status": "insufficient_return_data"}

    mean_returns = returns_matrix.mean().values  # annualize later
    cov_matrix = returns_matrix.cov().values

    n = len(available_tickers)

    # --- Risk-free rate ---
    risk_free_annual = 0.0
    latest_ffr = (
        session.query(MacroIndicator)
        .filter(MacroIndicator.indicator_name == "fed_funds_rate")
        .order_by(MacroIndicator.date.desc())
        .first()
    )
    if latest_ffr and latest_ffr.value is not None:
        risk_free_annual = latest_ffr.value / 100.0

    rf_daily = risk_free_annual / TRADING_DAYS_PER_YEAR

    # --- Objective: negative Sharpe ratio (we minimise) ---
    def neg_sharpe(weights: np.ndarray) -> float:
        port_return = np.dot(weights, mean_returns)
        port_vol = np.sqrt(np.dot(weights, np.dot(cov_matrix, weights)))
        if port_vol == 0:
            return 1e6
        sharpe = (port_return - rf_daily) / port_vol
        return -sharpe

    # Constraints & bounds
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    max_w = settings.max_position_pct
    bounds = [(0.0, max_w) for _ in range(n)]

    # If max_w * n < 1 the constraint is infeasible; relax the upper bound
    if max_w * n < 1.0:
        bounds = [(0.0, 1.0) for _ in range(n)]

    initial_weights = np.array([1.0 / n] * n)

    result = minimize(
        neg_sharpe,
        initial_weights,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-10},
    )

    if not result.success:
        logger.warning("Optimisation did not converge: %s", result.message)
        # Fall back to equal weight
        weights_dict = {t: round(1.0 / n, 4) for t in available_tickers}
        return {"weights": weights_dict, "status": "fallback_equal_weight"}

    optimised_weights = result.x

    # Annualised metrics of the optimised portfolio
    opt_return = float(np.dot(optimised_weights, mean_returns)) * TRADING_DAYS_PER_YEAR
    opt_vol = float(
        np.sqrt(np.dot(optimised_weights, np.dot(cov_matrix, optimised_weights)))
    ) * np.sqrt(TRADING_DAYS_PER_YEAR)
    opt_sharpe = (opt_return - risk_free_annual) / opt_vol if opt_vol > 0 else 0.0

    weights_dict = {
        t: round(float(w), 4)
        for t, w in zip(available_tickers, optimised_weights)
        if w > 1e-6
    }

    return {
        "weights": weights_dict,
        "expected_annual_return": round(opt_return, 4),
        "expected_annual_volatility": round(opt_vol, 4),
        "expected_sharpe": round(opt_sharpe, 4),
        "status": "optimal",
    }
