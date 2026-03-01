"""
Multi-factor stock screener.

Combines technical and fundamental scores with optional sector, volume,
and regime filters to produce a ranked shortlist of tickers.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from db.models import (
    Fundamental,
    RegimeState,
    StockPrice,
    TechnicalSignal,
)

logger = logging.getLogger(__name__)

# Default filter values
DEFAULT_FILTERS = {
    "min_composite_score": 0,
    "min_fundamental_score": 0,
    "sector": None,
    "min_volume": 0,
    "regime_filter": None,        # e.g. "RISK_ON"
    "timeframe": "daily",
    "limit": 50,
}


def screen_stocks(session: Session, filters: dict | None = None) -> list[dict]:
    """Run a multi-factor screen and return a ranked list of tickers.

    Parameters
    ----------
    session : Session
        SQLAlchemy session.
    filters : dict, optional
        Keys accepted (all optional):
        - ``min_composite_score`` (float): minimum technical composite score.
        - ``min_fundamental_score`` (float): minimum fundamental weighted score.
        - ``sector`` (str): restrict to a given sector.
        - ``min_volume`` (int): minimum average daily volume.
        - ``regime_filter`` (str): only return results when the current regime
          matches (e.g. ``"RISK_ON"``).
        - ``timeframe`` (str): technical signal timeframe, default ``"daily"``.
        - ``limit`` (int): maximum number of results.

    Returns
    -------
    list[dict]
        Ranked list (highest combined score first) of dicts with ticker,
        scores, sector, and meta information.
    """
    cfg = {**DEFAULT_FILTERS, **(filters or {})}

    # ── Regime gate ──────────────────────────────────────────────────────
    if cfg["regime_filter"]:
        latest_regime = (
            session.execute(
                select(RegimeState).order_by(RegimeState.date.desc())
            )
            .scalars()
            .first()
        )
        if latest_regime and latest_regime.regime_label != cfg["regime_filter"]:
            logger.info(
                "Regime filter %s does not match current regime %s — returning empty",
                cfg["regime_filter"],
                latest_regime.regime_label,
            )
            return []

    # ── Fetch latest technical signals ───────────────────────────────────
    timeframe = cfg["timeframe"]
    tech_subq = (
        select(
            TechnicalSignal.ticker,
            func.max(TechnicalSignal.date).label("max_date"),
        )
        .where(TechnicalSignal.timeframe == timeframe)
        .group_by(TechnicalSignal.ticker)
        .subquery()
    )

    tech_rows = (
        session.execute(
            select(TechnicalSignal)
            .join(
                tech_subq,
                and_(
                    TechnicalSignal.ticker == tech_subq.c.ticker,
                    TechnicalSignal.date == tech_subq.c.max_date,
                    TechnicalSignal.timeframe == timeframe,
                ),
            )
        )
        .scalars()
        .all()
    )

    if not tech_rows:
        logger.warning("No technical signals found for timeframe %s", timeframe)
        return []

    # ── Fetch latest fundamentals per ticker ─────────────────────────────
    fund_subq = (
        select(
            Fundamental.ticker,
            func.max(Fundamental.date_fetched).label("max_date"),
        )
        .group_by(Fundamental.ticker)
        .subquery()
    )

    fund_rows = (
        session.execute(
            select(Fundamental).join(
                fund_subq,
                and_(
                    Fundamental.ticker == fund_subq.c.ticker,
                    Fundamental.date_fetched == fund_subq.c.max_date,
                ),
            )
        )
        .scalars()
        .all()
    )

    fund_map: dict[str, Fundamental] = {f.ticker: f for f in fund_rows}

    # ── Fetch average volume (last 20 days) per ticker ───────────────────
    vol_cutoff = date.today() - timedelta(days=40)
    vol_subq = (
        select(
            StockPrice.ticker,
            func.avg(StockPrice.volume).label("avg_volume"),
        )
        .where(StockPrice.date >= vol_cutoff)
        .group_by(StockPrice.ticker)
        .subquery()
    )

    vol_rows = session.execute(select(vol_subq)).all()
    vol_map: dict[str, float] = {r.ticker: r.avg_volume or 0 for r in vol_rows}

    # ── Build result list ────────────────────────────────────────────────
    results: list[dict] = []

    for ts in tech_rows:
        ticker = ts.ticker
        composite = ts.composite_score or 0

        # Composite score filter
        if composite < cfg["min_composite_score"]:
            continue

        # Sector filter
        fund = fund_map.get(ticker)
        sector = fund.sector if fund else None
        if cfg["sector"] and (sector is None or sector.lower() != cfg["sector"].lower()):
            continue

        # Fundamental score (inline lightweight calculation)
        fund_score = _quick_fundamental_score(fund) if fund else None
        if cfg["min_fundamental_score"] and (
            fund_score is None or fund_score < cfg["min_fundamental_score"]
        ):
            continue

        # Volume filter
        avg_vol = vol_map.get(ticker, 0)
        if cfg["min_volume"] is not None and avg_vol < cfg["min_volume"]:
            continue

        # Combined ranking score (equal weight tech + fundamental)
        combined = composite
        if fund_score is not None:
            combined = composite * 0.5 + fund_score * 0.5

        results.append(
            {
                "ticker": ticker,
                "composite_score": round(composite, 2),
                "trend_score": _r(ts.trend_score),
                "momentum_score": _r(ts.momentum_score),
                "volatility_score": _r(ts.volatility_score),
                "volume_score": _r(ts.volume_score),
                "fundamental_score": round(fund_score, 2) if fund_score else None,
                "combined_score": round(combined, 2),
                "sector": sector,
                "avg_volume": int(avg_vol) if avg_vol else None,
                "signal_date": str(ts.date),
            }
        )

    # Sort by combined score descending
    results.sort(key=lambda x: x["combined_score"], reverse=True)

    limit = cfg["limit"]
    return results[:limit]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _r(val) -> float | None:
    """Round a nullable float to 2 decimals."""
    return round(val, 2) if val is not None else None


def _quick_fundamental_score(f: Fundamental) -> float:
    """Lightweight fundamental score (mirrors fundamental.py logic at reduced
    resolution) so that the screener can rank without importing the full
    scoring engine a second time.
    """
    import numpy as np

    scores: list[float] = []

    # Value (PE based)
    pe = f.pe_ratio
    if pe is not None and not np.isnan(pe) and pe > 0:
        if pe < 15:
            scores.append(80)
        elif pe < 25:
            scores.append(55)
        else:
            scores.append(30)
    else:
        scores.append(50)

    # Quality (ROE based)
    roe = f.roe
    if roe is not None and not np.isnan(roe):
        if roe > 15:
            scores.append(80)
        elif roe > 5:
            scores.append(55)
        else:
            scores.append(30)
    else:
        scores.append(50)

    # Growth (revenue growth)
    rg = f.revenue_growth
    if rg is not None and not np.isnan(rg):
        pct = rg * 100 if abs(rg) < 5 else rg
        if pct > 15:
            scores.append(80)
        elif pct > 0:
            scores.append(55)
        else:
            scores.append(30)
    else:
        scores.append(50)

    # Dividend
    dy = f.dividend_yield
    if dy is not None and not np.isnan(dy):
        pct = dy * 100 if dy < 1 else dy
        if pct > 2:
            scores.append(70)
        else:
            scores.append(45)
    else:
        scores.append(50)

    return float(np.mean(scores))
