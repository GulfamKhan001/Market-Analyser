"""
Multi-timeframe confluence analysis.

Checks whether daily, weekly, and monthly technical signals agree on
direction and produces a confluence score that can boost or dampen
conviction in a trade idea.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import TechnicalSignal

logger = logging.getLogger(__name__)

# Timeframes ordered from shortest to longest
TIMEFRAMES = ["daily", "weekly", "monthly"]

# Bonus points for alignment
DAILY_WEEKLY_BONUS = 20
MONTHLY_ALIGNMENT_BONUS = 10


def _classify_signal(ts: TechnicalSignal) -> str:
    """Classify a TechnicalSignal as 'bullish', 'bearish', or 'neutral'.

    Uses a combination of composite_score, MACD histogram, RSI, and trend
    score to make the call.
    """
    bullish_votes = 0
    bearish_votes = 0

    # Composite score
    comp = ts.composite_score
    if comp is not None:
        if comp >= 60:
            bullish_votes += 2
        elif comp <= 40:
            bearish_votes += 2

    # MACD histogram
    macd_h = ts.macd_hist
    if macd_h is not None:
        if macd_h > 0:
            bullish_votes += 1
        elif macd_h < 0:
            bearish_votes += 1

    # RSI
    rsi = ts.rsi
    if rsi is not None:
        if rsi > 55:
            bullish_votes += 1
        elif rsi < 45:
            bearish_votes += 1

    # Trend score
    trend = ts.trend_score
    if trend is not None:
        if trend >= 60:
            bullish_votes += 1
        elif trend <= 40:
            bearish_votes += 1

    if bullish_votes >= bearish_votes + 2:
        return "bullish"
    elif bearish_votes >= bullish_votes + 2:
        return "bearish"
    return "neutral"


def _get_latest_signal(
    ticker: str, timeframe: str, session: Session
) -> Optional[TechnicalSignal]:
    """Retrieve the most recent TechnicalSignal for a ticker + timeframe."""
    return (
        session.execute(
            select(TechnicalSignal)
            .where(
                TechnicalSignal.ticker == ticker,
                TechnicalSignal.timeframe == timeframe,
            )
            .order_by(TechnicalSignal.date.desc())
        )
        .scalars()
        .first()
    )


def multi_timeframe_confluence(ticker: str, session: Session) -> dict:
    """Evaluate multi-timeframe confluence for *ticker*.

    Returns
    -------
    dict
        Keys:
        - ``confluence_score`` (int): 0-100 confidence bonus.
        - ``aligned_timeframes`` (list[str]): timeframes that agree.
        - ``signals`` (dict): per-timeframe classification.
        - ``base_direction`` (str): the dominant direction across timeframes.
    """
    signals: dict[str, dict] = {}

    for tf in TIMEFRAMES:
        ts = _get_latest_signal(ticker, tf, session)
        if ts is not None:
            classification = _classify_signal(ts)
            signals[tf] = {
                "classification": classification,
                "composite_score": ts.composite_score,
                "date": str(ts.date),
            }
        else:
            signals[tf] = {
                "classification": "unavailable",
                "composite_score": None,
                "date": None,
            }

    # ── Compute confluence ───────────────────────────────────────────────
    available = {
        tf: info
        for tf, info in signals.items()
        if info["classification"] != "unavailable"
    }

    if not available:
        return {
            "ticker": ticker,
            "confluence_score": 0,
            "aligned_timeframes": [],
            "signals": signals,
            "base_direction": "unknown",
        }

    # Determine dominant direction by majority vote
    direction_counts: dict[str, int] = {"bullish": 0, "bearish": 0, "neutral": 0}
    for info in available.values():
        direction_counts[info["classification"]] += 1

    base_direction = max(direction_counts, key=direction_counts.get)  # type: ignore[arg-type]

    aligned: list[str] = [
        tf for tf, info in available.items() if info["classification"] == base_direction
    ]

    confluence_score = 0

    # Daily + weekly alignment
    daily_cls = signals.get("daily", {}).get("classification")
    weekly_cls = signals.get("weekly", {}).get("classification")
    monthly_cls = signals.get("monthly", {}).get("classification")

    if (
        daily_cls not in (None, "unavailable")
        and weekly_cls not in (None, "unavailable")
        and daily_cls == weekly_cls
        and daily_cls != "neutral"
    ):
        confluence_score += DAILY_WEEKLY_BONUS

        # Monthly on top
        if (
            monthly_cls not in (None, "unavailable")
            and monthly_cls == daily_cls
        ):
            confluence_score += MONTHLY_ALIGNMENT_BONUS

    # Baseline score from composite scores of aligned timeframes
    comp_scores = [
        info["composite_score"]
        for tf, info in available.items()
        if tf in aligned and info["composite_score"] is not None
    ]
    if comp_scores:
        avg_comp = float(np.mean(comp_scores))
        # Scale avg composite (0-100) to contribute up to 50 points
        confluence_score += int(avg_comp * 0.5)

    # If all available timeframes agree and are non-neutral, extra bump
    if (
        len(aligned) == len(available)
        and len(aligned) >= 2
        and base_direction != "neutral"
    ):
        confluence_score += 10

    confluence_score = min(confluence_score, 100)

    logger.info(
        "%s confluence: %s (score=%d, aligned=%s)",
        ticker,
        base_direction,
        confluence_score,
        aligned,
    )

    return {
        "ticker": ticker,
        "confluence_score": confluence_score,
        "aligned_timeframes": aligned,
        "signals": signals,
        "base_direction": base_direction,
    }
