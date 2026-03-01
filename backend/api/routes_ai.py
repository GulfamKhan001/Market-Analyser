from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date

from db.database import get_db
from db.models import TechnicalSignal, RegimeState
from analysis.technical import analyze_ticker
from analysis.fundamental import compute_fundamental_score
from analysis.regime import detect_regime
from portfolio.manager import get_portfolio_summary
from ai.reasoner import AIReasoner

router = APIRouter()
reasoner = AIReasoner()


@router.get("/analyze/{ticker}")
async def ai_analyze_ticker(
    ticker: str,
    deep: bool = Query(False, description="Use deeper model for analysis"),
    db: Session = Depends(get_db),
):
    """Run AI analysis on a single ticker."""
    ticker = ticker.upper()

    technical = analyze_ticker(ticker, session=db)
    fundamental = compute_fundamental_score(ticker, session=db)
    regime = detect_regime(db)
    portfolio = get_portfolio_summary(db)

    try:
        result = await reasoner.analyze_ticker(
            ticker=ticker,
            technical_data=technical,
            fundamental_data=fundamental,
            regime_data=regime,
            portfolio_exposure=portfolio,
            deep=deep,
        )
        return {
            "ticker": ticker,
            "analysis_type": "deep" if deep else "standard",
            "result": result.model_dump(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@router.post("/screen")
async def ai_screen_tickers(
    tickers: list[str] = Query(None, description="Tickers to screen"),
    db: Session = Depends(get_db),
):
    """AI-powered batch screening of tickers."""
    from config import get_settings
    settings = get_settings()

    if not tickers:
        tickers = settings.default_tickers

    tickers_data = []
    for t in tickers:
        t = t.upper()
        technical = analyze_ticker(t, session=db)
        fundamental = compute_fundamental_score(t, session=db)
        tickers_data.append({
            "ticker": t,
            "technical": technical,
            "fundamental": fundamental,
        })

    try:
        results = await reasoner.screen_tickers(tickers_data)
        return {
            "count": len(results),
            "screenings": [r.model_dump() for r in results],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI screening failed: {str(e)}")


@router.get("/outlook")
async def ai_market_outlook(db: Session = Depends(get_db)):
    """Get AI-generated market outlook."""
    from db.models import MacroIndicator

    regime = detect_regime(db)

    macro_data = {}
    for name in ["GDP", "CPI", "unemployment_rate", "fed_funds_rate", "10y_yield", "2y_yield", "VIX"]:
        latest = (
            db.query(MacroIndicator)
            .filter(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
            .first()
        )
        if latest:
            macro_data[name] = latest.value

    sector_data = {}
    signals = (
        db.query(TechnicalSignal)
        .filter(TechnicalSignal.timeframe == "daily")
        .order_by(TechnicalSignal.date.desc())
        .all()
    )
    seen = set()
    for s in signals:
        if s.ticker not in seen:
            sector_data[s.ticker] = s.composite_score
            seen.add(s.ticker)

    try:
        result = await reasoner.market_outlook(regime, macro_data, sector_data)
        return {"outlook": result.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI outlook failed: {str(e)}")
