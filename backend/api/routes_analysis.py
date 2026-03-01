from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date, timedelta

from db.database import get_db
from db.models import TechnicalSignal
from analysis.technical import analyze_ticker, compute_indicators
from analysis.fundamental import compute_fundamental_score
from analysis.screener import screen_stocks
from analysis.indicators import multi_timeframe_confluence

router = APIRouter()


@router.get("/technical/{ticker}")
def get_technical_analysis(
    ticker: str,
    timeframe: str = Query("daily", description="daily, weekly, monthly"),
    db: Session = Depends(get_db),
):
    """Get technical analysis for a ticker."""
    ticker = ticker.upper()

    signal = (
        db.query(TechnicalSignal)
        .filter(
            TechnicalSignal.ticker == ticker,
            TechnicalSignal.timeframe == timeframe,
        )
        .order_by(TechnicalSignal.date.desc())
        .first()
    )

    if not signal or (date.today() - signal.date).days > 1:
        result = analyze_ticker(ticker, session=db)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        signal = (
            db.query(TechnicalSignal)
            .filter(
                TechnicalSignal.ticker == ticker,
                TechnicalSignal.timeframe == timeframe,
            )
            .order_by(TechnicalSignal.date.desc())
            .first()
        )

    if not signal:
        raise HTTPException(status_code=404, detail=f"No technical data for {ticker}")

    return {
        "ticker": ticker,
        "date": str(signal.date),
        "timeframe": signal.timeframe,
        "scores": {
            "composite": signal.composite_score,
            "trend": signal.trend_score,
            "momentum": signal.momentum_score,
            "volatility": signal.volatility_score,
            "volume": signal.volume_score,
        },
        "indicators": {
            "rsi": signal.rsi,
            "macd": signal.macd,
            "macd_signal": signal.macd_signal,
            "macd_hist": signal.macd_hist,
            "adx": signal.adx,
            "stochastic_k": signal.stochastic_k,
            "stochastic_d": signal.stochastic_d,
            "bb_upper": signal.bb_upper,
            "bb_middle": signal.bb_middle,
            "bb_lower": signal.bb_lower,
            "atr": signal.atr,
            "obv": signal.obv,
            "sma_20": signal.sma_20,
            "sma_50": signal.sma_50,
            "sma_200": signal.sma_200,
            "ema_12": signal.ema_12,
            "ema_26": signal.ema_26,
        },
    }


@router.get("/fundamental/{ticker}")
def get_fundamental_analysis(ticker: str, db: Session = Depends(get_db)):
    """Get fundamental score for a ticker."""
    ticker = ticker.upper()
    result = compute_fundamental_score(ticker, session=db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/confluence/{ticker}")
def get_confluence(ticker: str, db: Session = Depends(get_db)):
    """Get multi-timeframe confluence for a ticker."""
    ticker = ticker.upper()
    result = multi_timeframe_confluence(ticker, session=db)
    return result


@router.get("/screener")
def run_screener(
    min_composite: float = Query(50, ge=0, le=100),
    min_fundamental: float = Query(50, ge=0, le=100),
    sector: str = Query(None),
    min_volume: int = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Run multi-factor stock screener."""
    filters = {
        "min_composite_score": min_composite,
        "min_fundamental_score": min_fundamental,
        "sector": sector,
        "min_volume": min_volume,
    }
    results = screen_stocks(session=db, filters=filters)
    return {"count": len(results[:limit]), "results": results[:limit]}


@router.get("/full/{ticker}")
def get_full_analysis(ticker: str, db: Session = Depends(get_db)):
    """Get combined technical + fundamental + confluence analysis."""
    ticker = ticker.upper()

    technical = analyze_ticker(ticker, session=db)
    fundamental = compute_fundamental_score(ticker, session=db)
    confluence = multi_timeframe_confluence(ticker, session=db)

    return {
        "ticker": ticker,
        "technical": technical,
        "fundamental": fundamental,
        "confluence": confluence,
    }
