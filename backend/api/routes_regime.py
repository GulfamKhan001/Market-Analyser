from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta

from db.database import get_db
from db.models import RegimeState, MacroIndicator
from analysis.regime import detect_regime

router = APIRouter()


@router.get("/current")
def get_current_regime(db: Session = Depends(get_db)):
    """Get current market regime assessment."""
    latest = (
        db.query(RegimeState)
        .order_by(RegimeState.date.desc())
        .first()
    )

    if not latest or (date.today() - latest.date).days > 1:
        result = detect_regime(db)
        return result

    return {
        "date": str(latest.date),
        "regime_label": latest.regime_label,
        "confidence": latest.confidence,
        "vix_regime": latest.vix_regime,
        "yield_curve_state": latest.yield_curve_state,
        "breadth_score": latest.breadth_score,
        "hmm_state": latest.hmm_state,
    }


@router.get("/history")
def get_regime_history(
    days: int = 90,
    db: Session = Depends(get_db),
):
    """Get regime history over time."""
    start = date.today() - timedelta(days=days)
    states = (
        db.query(RegimeState)
        .filter(RegimeState.date >= start)
        .order_by(RegimeState.date)
        .all()
    )

    return {
        "count": len(states),
        "history": [
            {
                "date": str(s.date),
                "regime_label": s.regime_label,
                "confidence": s.confidence,
                "vix_regime": s.vix_regime,
                "hmm_state": s.hmm_state,
            }
            for s in states
        ],
    }


@router.get("/macro-dashboard")
def get_macro_dashboard(db: Session = Depends(get_db)):
    """Get macro indicators dashboard."""
    indicators = {}
    history = {}

    for name in ["GDP", "CPI", "unemployment_rate", "fed_funds_rate", "10y_yield", "2y_yield", "VIX"]:
        latest = (
            db.query(MacroIndicator)
            .filter(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
            .first()
        )
        if latest:
            indicators[name] = {"value": latest.value, "date": str(latest.date)}

        recent = (
            db.query(MacroIndicator)
            .filter(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
            .limit(12)
            .all()
        )
        history[name] = [
            {"date": str(r.date), "value": r.value}
            for r in reversed(recent)
        ]

    yield_spread = None
    if "10y_yield" in indicators and "2y_yield" in indicators:
        yield_spread = indicators["10y_yield"]["value"] - indicators["2y_yield"]["value"]

    return {
        "current": indicators,
        "history": history,
        "yield_spread": yield_spread,
        "yield_curve_inverted": yield_spread is not None and yield_spread < 0,
    }


@router.post("/refresh")
def refresh_regime(db: Session = Depends(get_db)):
    """Force refresh regime detection."""
    result = detect_regime(db)
    return {"status": "refreshed", "regime": result}
