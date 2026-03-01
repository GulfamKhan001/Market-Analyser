"""
Fundamental analysis scoring engine.

Reads the most recent Fundamental record for a ticker from the DB, scores
it across four dimensions (value, quality, growth, dividend), and returns
a weighted total.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Fundamental

logger = logging.getLogger(__name__)

# ── Weight configuration ─────────────────────────────────────────────────────
WEIGHTS = {
    "value": 0.25,
    "quality": 0.30,
    "growth": 0.30,
    "dividend": 0.15,
}


# ── Threshold-based scoring helpers ──────────────────────────────────────────

def _score_metric(
    value: Optional[float],
    thresholds: list[tuple[float, float]],
    higher_is_better: bool = True,
    default: float = 50.0,
) -> float:
    """Score a single metric against a list of (threshold, score) pairs.

    *thresholds* is an ascending list of ``(threshold_value, score)`` tuples.
    If ``higher_is_better`` is True the highest matching threshold wins;
    otherwise the lowest matching threshold wins.
    """
    if value is None or np.isnan(value):
        return default

    result = default
    for threshold, score in thresholds:
        if higher_is_better:
            if value >= threshold:
                result = score
        else:
            if value <= threshold:
                result = score
    return result


# ── Sub-score functions ──────────────────────────────────────────────────────

def _value_score(f: Fundamental) -> float:
    """Assess valuation cheapness (0-100, higher = cheaper/better)."""
    components: list[float] = []

    # P/E ratio: lower is better
    pe = f.pe_ratio
    if pe is not None and not np.isnan(pe) and pe > 0:
        if pe < 10:
            components.append(90)
        elif pe < 15:
            components.append(75)
        elif pe < 20:
            components.append(60)
        elif pe < 30:
            components.append(40)
        else:
            components.append(20)
    else:
        components.append(50)

    # P/B ratio: lower is better
    pb = f.pb_ratio
    if pb is not None and not np.isnan(pb) and pb > 0:
        if pb < 1.0:
            components.append(90)
        elif pb < 2.0:
            components.append(70)
        elif pb < 4.0:
            components.append(50)
        else:
            components.append(25)
    else:
        components.append(50)

    # P/S ratio
    ps = f.ps_ratio
    if ps is not None and not np.isnan(ps) and ps > 0:
        if ps < 1.0:
            components.append(85)
        elif ps < 3.0:
            components.append(65)
        elif ps < 6.0:
            components.append(45)
        else:
            components.append(20)
    else:
        components.append(50)

    # PEG ratio
    peg = f.peg_ratio
    if peg is not None and not np.isnan(peg) and peg > 0:
        if peg < 1.0:
            components.append(85)
        elif peg < 1.5:
            components.append(65)
        elif peg < 2.5:
            components.append(45)
        else:
            components.append(25)
    else:
        components.append(50)

    # EV/EBITDA
    ev = f.ev_to_ebitda
    if ev is not None and not np.isnan(ev) and ev > 0:
        if ev < 8:
            components.append(85)
        elif ev < 12:
            components.append(65)
        elif ev < 18:
            components.append(45)
        else:
            components.append(25)
    else:
        components.append(50)

    return float(np.mean(components))


def _quality_score(f: Fundamental) -> float:
    """Assess business quality (0-100, higher = better)."""
    components: list[float] = []

    # ROE
    roe = f.roe
    if roe is not None and not np.isnan(roe):
        if roe > 25:
            components.append(90)
        elif roe > 15:
            components.append(75)
        elif roe > 10:
            components.append(55)
        elif roe > 0:
            components.append(35)
        else:
            components.append(15)
    else:
        components.append(50)

    # ROA
    roa = f.roa
    if roa is not None and not np.isnan(roa):
        if roa > 15:
            components.append(90)
        elif roa > 8:
            components.append(70)
        elif roa > 3:
            components.append(50)
        elif roa > 0:
            components.append(30)
        else:
            components.append(15)
    else:
        components.append(50)

    # Debt-to-equity: lower is better
    de = f.debt_to_equity
    if de is not None and not np.isnan(de):
        if de < 0.3:
            components.append(90)
        elif de < 0.7:
            components.append(70)
        elif de < 1.5:
            components.append(50)
        elif de < 3.0:
            components.append(30)
        else:
            components.append(15)
    else:
        components.append(50)

    # Current ratio: higher is safer
    cr = f.current_ratio
    if cr is not None and not np.isnan(cr):
        if cr > 3.0:
            components.append(85)
        elif cr > 2.0:
            components.append(70)
        elif cr > 1.5:
            components.append(55)
        elif cr > 1.0:
            components.append(40)
        else:
            components.append(20)
    else:
        components.append(50)

    # Free cash flow (positive is good; we only check sign here)
    fcf = f.free_cash_flow
    if fcf is not None and not np.isnan(fcf):
        if fcf > 0:
            components.append(70)
        else:
            components.append(25)
    else:
        components.append(50)

    return float(np.mean(components))


def _growth_score(f: Fundamental) -> float:
    """Assess growth profile (0-100, higher = stronger growth)."""
    components: list[float] = []

    # Revenue growth (assumed as decimal, e.g. 0.15 = 15%)
    rg = f.revenue_growth
    if rg is not None and not np.isnan(rg):
        pct = rg * 100 if abs(rg) < 5 else rg  # handle both decimal & percent
        if pct > 30:
            components.append(90)
        elif pct > 15:
            components.append(75)
        elif pct > 5:
            components.append(55)
        elif pct > 0:
            components.append(40)
        else:
            components.append(20)
    else:
        components.append(50)

    # Earnings growth
    eg = f.earnings_growth
    if eg is not None and not np.isnan(eg):
        pct = eg * 100 if abs(eg) < 5 else eg
        if pct > 30:
            components.append(90)
        elif pct > 15:
            components.append(75)
        elif pct > 5:
            components.append(55)
        elif pct > 0:
            components.append(40)
        else:
            components.append(20)
    else:
        components.append(50)

    return float(np.mean(components))


def _dividend_score(f: Fundamental) -> float:
    """Assess dividend attractiveness (0-100)."""
    dy = f.dividend_yield
    if dy is None or np.isnan(dy):
        return 50.0  # no data => neutral

    pct = dy * 100 if dy < 1 else dy  # handle decimal vs percent
    if pct > 5:
        return 85.0
    elif pct > 3:
        return 70.0
    elif pct > 1.5:
        return 55.0
    elif pct > 0:
        return 40.0
    else:
        return 30.0  # zero dividend


# ── Public API ───────────────────────────────────────────────────────────────

def compute_fundamental_score(ticker: str, session: Session) -> dict:
    """Compute a weighted fundamental score for *ticker*.

    Returns a dict with sub-scores and total, or an error dict when no
    fundamental data is available.
    """
    fund: Optional[Fundamental] = (
        session.execute(
            select(Fundamental)
            .where(Fundamental.ticker == ticker)
            .order_by(Fundamental.date_fetched.desc())
        )
        .scalars()
        .first()
    )

    if fund is None:
        logger.warning("No fundamental data for %s", ticker)
        return {"ticker": ticker, "error": "no_fundamental_data"}

    value = _value_score(fund)
    quality = _quality_score(fund)
    growth = _growth_score(fund)
    dividend = _dividend_score(fund)

    total = (
        value * WEIGHTS["value"]
        + quality * WEIGHTS["quality"]
        + growth * WEIGHTS["growth"]
        + dividend * WEIGHTS["dividend"]
    )

    return {
        "ticker": ticker,
        "date_fetched": str(fund.date_fetched),
        "value_score": round(value, 2),
        "quality_score": round(quality, 2),
        "growth_score": round(growth, 2),
        "dividend_score": round(dividend, 2),
        "fundamental_score": round(total, 2),
        "sector": fund.sector,
        "industry": fund.industry,
    }
