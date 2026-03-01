"""
Market regime detection engine.

Combines three signal sources:
  1. HMM (Hidden Markov Model) on S&P 500 returns + VIX changes
  2. VIX level rule-based regime
  3. Macro indicators (yield curve, fed funds direction, unemployment trend)

Produces a combined regime label: RISK_ON, NEUTRAL, RISK_OFF, or CRISIS.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import MacroIndicator, RegimeState, StockPrice

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
HMM_MIN_OBSERVATIONS = 120  # ~6 months of trading days
N_HMM_STATES = 3

# VIX thresholds
VIX_LOW = 15
VIX_NORMAL = 25
VIX_HIGH = 35

# Regime vote weights
VOTE_WEIGHTS = {"hmm": 0.40, "vix": 0.35, "macro": 0.25}


# ── HMM regime ───────────────────────────────────────────────────────────────

def _hmm_regime(session: Session, lookback_days: int = 500) -> Optional[dict]:
    """Fit a 3-state GaussianHMM on S&P 500 returns + VIX changes.

    Returns ``{"state": int, "label": str, "confidence": float}`` or None if
    insufficient data.
    """
    try:
        from hmmlearn.hmm import GaussianHMM
    except ImportError:
        logger.warning("hmmlearn not installed; skipping HMM regime detection")
        return None

    cutoff = date.today() - timedelta(days=lookback_days)

    # S&P 500 proxy — ticker "^GSPC" or "SPY"
    sp_rows = (
        session.execute(
            select(StockPrice)
            .where(
                StockPrice.ticker.in_(["^GSPC", "SPY"]),
                StockPrice.date >= cutoff,
            )
            .order_by(StockPrice.date)
        )
        .scalars()
        .all()
    )

    # VIX data from macro_indicators
    vix_rows = (
        session.execute(
            select(MacroIndicator)
            .where(
                MacroIndicator.indicator_name == "VIX",
                MacroIndicator.date >= cutoff,
            )
            .order_by(MacroIndicator.date)
        )
        .scalars()
        .all()
    )

    if len(sp_rows) < HMM_MIN_OBSERVATIONS:
        logger.info("Not enough S&P data for HMM (%d rows)", len(sp_rows))
        return None

    sp_df = pd.DataFrame(
        [{"date": r.date, "close": r.close} for r in sp_rows]
    )
    sp_df["returns"] = sp_df["close"].pct_change()

    if vix_rows:
        vix_df = pd.DataFrame(
            [{"date": r.date, "vix": r.value} for r in vix_rows]
        )
        vix_df["vix_change"] = vix_df["vix"].pct_change()
        merged = sp_df.merge(vix_df[["date", "vix_change"]], on="date", how="left")
        merged["vix_change"] = merged["vix_change"].fillna(0)
    else:
        merged = sp_df.copy()
        merged["vix_change"] = 0.0

    merged = merged.dropna(subset=["returns"])

    if len(merged) < HMM_MIN_OBSERVATIONS:
        return None

    X = merged[["returns", "vix_change"]].values
    # Drop any remaining NaN/inf
    mask = np.isfinite(X).all(axis=1)
    X = X[mask]

    if len(X) < HMM_MIN_OBSERVATIONS:
        return None

    model = GaussianHMM(
        n_components=N_HMM_STATES,
        covariance_type="full",
        n_iter=200,
        random_state=42,
        verbose=False,
    )
    try:
        model.fit(X)
        states = model.predict(X)
    except Exception as e:
        logger.warning("HMM fitting failed: %s", e)
        return None

    # Map states to labels by mean return of each state
    state_means = {}
    for s in range(N_HMM_STATES):
        mask = states == s
        state_means[s] = X[mask, 0].mean() if mask.any() else 0.0

    sorted_states = sorted(state_means, key=state_means.get)  # type: ignore[arg-type]
    label_map = {
        sorted_states[0]: "Bear",
        sorted_states[1]: "Sideways",
        sorted_states[2]: "Bull",
    }

    current_state = int(states[-1])
    current_label = label_map[current_state]

    # Confidence based on posterior probability
    posteriors = model.predict_proba(X)
    confidence = float(posteriors[-1, current_state])

    return {
        "state": current_state,
        "label": current_label,
        "confidence": round(confidence, 4),
    }


# ── VIX regime ───────────────────────────────────────────────────────────────

def _vix_regime(session: Session) -> dict:
    """Rule-based VIX regime classification."""
    latest_vix = (
        session.execute(
            select(MacroIndicator)
            .where(MacroIndicator.indicator_name == "VIX")
            .order_by(MacroIndicator.date.desc())
        )
        .scalars()
        .first()
    )

    if latest_vix is None:
        return {"vix_level": None, "label": "Unknown", "confidence": 0.0}

    vix = latest_vix.value
    if vix < VIX_LOW:
        label = "Low"
    elif vix < VIX_NORMAL:
        label = "Normal"
    elif vix < VIX_HIGH:
        label = "High"
    else:
        label = "Crisis"

    return {
        "vix_level": round(vix, 2),
        "label": label,
        "confidence": 0.85,
    }


# ── Macro regime ─────────────────────────────────────────────────────────────

def _macro_regime(session: Session) -> dict:
    """Assess macro conditions: yield curve, fed funds direction, unemployment."""
    signals: dict[str, str] = {}
    confidence = 0.5

    # Yield curve: 10Y - 2Y spread
    spread = None  # not stored directly; compute from components
    ten_y = _latest_macro_value(session, "10y_yield")
    two_y = _latest_macro_value(session, "2y_yield")

    if spread is not None:
        yc = spread
    elif ten_y is not None and two_y is not None:
        yc = ten_y - two_y
    else:
        yc = None

    if yc is not None:
        if yc < -0.2:
            signals["yield_curve"] = "Inverted"
        elif yc < 0.5:
            signals["yield_curve"] = "Flat"
        else:
            signals["yield_curve"] = "Normal"
    else:
        signals["yield_curve"] = "Unknown"

    # Fed funds direction (compare last two observations)
    ff_direction = _indicator_trend(session, "fed_funds_rate")
    signals["fed_funds"] = ff_direction  # "Rising", "Falling", "Flat", "Unknown"

    # Unemployment trend
    unemp_direction = _indicator_trend(session, "unemployment_rate")
    signals["unemployment"] = unemp_direction

    # Score macro environment
    bearish_count = 0
    bullish_count = 0

    if signals["yield_curve"] == "Inverted":
        bearish_count += 2
    elif signals["yield_curve"] == "Normal":
        bullish_count += 1

    if signals["fed_funds"] == "Falling":
        bullish_count += 1  # easing
    elif signals["fed_funds"] == "Rising":
        bearish_count += 1  # tightening

    if signals["unemployment"] == "Rising":
        bearish_count += 1
    elif signals["unemployment"] == "Falling":
        bullish_count += 1

    if bearish_count >= 3:
        label = "Contractionary"
    elif bearish_count >= 2:
        label = "Late_Cycle"
    elif bullish_count >= 2:
        label = "Expansionary"
    else:
        label = "Neutral"

    return {
        "label": label,
        "signals": signals,
        "yield_curve_spread": yc,
        "confidence": confidence,
    }


def _latest_macro_value(session: Session, name: str) -> Optional[float]:
    """Get the most recent value for a macro indicator."""
    row = (
        session.execute(
            select(MacroIndicator)
            .where(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
        )
        .scalars()
        .first()
    )
    return row.value if row else None


def _indicator_trend(session: Session, name: str, n: int = 3) -> str:
    """Determine if a macro indicator is Rising, Falling, or Flat over the
    last *n* observations.
    """
    rows = (
        session.execute(
            select(MacroIndicator)
            .where(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
            .limit(n)
        )
        .scalars()
        .all()
    )
    if len(rows) < 2:
        return "Unknown"

    values = [r.value for r in reversed(rows)]
    diff = values[-1] - values[0]
    if abs(diff) < 0.05:
        return "Flat"
    return "Rising" if diff > 0 else "Falling"


# ── Combined regime detection ────────────────────────────────────────────────

def detect_regime(session: Session) -> dict:
    """Run all three regime detectors and produce a combined label.

    Saves a :class:`RegimeState` row and returns the full result dict.
    """
    hmm_result = _hmm_regime(session)
    vix_result = _vix_regime(session)
    macro_result = _macro_regime(session)

    # ── Weighted voting ──────────────────────────────────────────────────
    # Each detector casts a vote with its weight.
    # Map detector labels to a numeric score: -1 (bearish) to +1 (bullish).
    vote_total = 0.0
    weight_total = 0.0

    # HMM vote
    if hmm_result is not None:
        hmm_map = {"Bull": 1.0, "Sideways": 0.0, "Bear": -1.0}
        vote_total += hmm_map.get(hmm_result["label"], 0) * VOTE_WEIGHTS["hmm"]
        weight_total += VOTE_WEIGHTS["hmm"]

    # VIX vote
    if vix_result["label"] != "Unknown":
        vix_map = {"Low": 1.0, "Normal": 0.3, "High": -0.5, "Crisis": -1.0}
        vote_total += vix_map.get(vix_result["label"], 0) * VOTE_WEIGHTS["vix"]
        weight_total += VOTE_WEIGHTS["vix"]

    # Macro vote
    macro_map = {
        "Expansionary": 1.0,
        "Neutral": 0.0,
        "Late_Cycle": -0.5,
        "Contractionary": -1.0,
    }
    vote_total += macro_map.get(macro_result["label"], 0) * VOTE_WEIGHTS["macro"]
    weight_total += VOTE_WEIGHTS["macro"]

    if weight_total > 0:
        combined_score = vote_total / weight_total
    else:
        combined_score = 0.0

    # Crisis override
    if vix_result["label"] == "Crisis":
        combined_label = "CRISIS"
    elif combined_score > 0.3:
        combined_label = "RISK_ON"
    elif combined_score < -0.3:
        combined_label = "RISK_OFF"
    else:
        combined_label = "NEUTRAL"

    # Confidence = average of available detector confidences
    confidences = []
    if hmm_result:
        confidences.append(hmm_result["confidence"])
    confidences.append(vix_result.get("confidence", 0.5))
    confidences.append(macro_result.get("confidence", 0.5))
    avg_confidence = float(np.mean(confidences))

    # ── Persist ──────────────────────────────────────────────────────────
    today = date.today()
    existing = (
        session.execute(
            select(RegimeState).where(RegimeState.date == today)
        )
        .scalars()
        .first()
    )
    if existing:
        session.delete(existing)
        session.flush()

    regime = RegimeState(
        date=today,
        regime_label=combined_label,
        confidence=round(avg_confidence, 4),
        vix_regime=vix_result["label"],
        yield_curve_state=macro_result["signals"].get("yield_curve"),
        breadth_score=None,  # placeholder for future breadth indicator
        hmm_state=hmm_result["state"] if hmm_result else None,
    )
    session.add(regime)
    session.commit()

    logger.info("Regime detected: %s (confidence %.2f)", combined_label, avg_confidence)

    return {
        "date": str(today),
        "regime_label": combined_label,
        "combined_score": round(combined_score, 4),
        "confidence": round(avg_confidence, 4),
        "hmm": hmm_result,
        "vix": vix_result,
        "macro": macro_result,
    }
