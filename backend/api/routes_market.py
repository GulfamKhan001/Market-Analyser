from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date, timedelta

from db.database import get_db
from db.models import StockPrice, Fundamental, MacroIndicator, NewsSentiment
from ingestion.yahoo import fetch_prices, fetch_fundamentals
from ingestion.fred import fetch_macro_indicators
from ingestion.finnhub_client import fetch_news

router = APIRouter()


@router.get("/prices/{ticker}")
def get_prices(
    ticker: str,
    period: str = Query("6mo", description="1mo, 3mo, 6mo, 1y, 2y, 5y"),
    db: Session = Depends(get_db),
):
    """Get historical prices for a ticker. Fetches from source if not in DB."""
    ticker = ticker.upper()

    period_days = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_days.get(period, 180)
    start_date = date.today() - timedelta(days=days)

    prices = (
        db.query(StockPrice)
        .filter(StockPrice.ticker == ticker, StockPrice.date >= start_date)
        .order_by(StockPrice.date)
        .all()
    )

    if not prices:
        fetch_prices(ticker, period=period, session=db)
        prices = (
            db.query(StockPrice)
            .filter(StockPrice.ticker == ticker, StockPrice.date >= start_date)
            .order_by(StockPrice.date)
            .all()
        )

    return {
        "ticker": ticker,
        "count": len(prices),
        "data": [
            {
                "date": str(p.date),
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "adj_close": p.adj_close,
                "volume": p.volume,
            }
            for p in prices
        ],
    }


@router.get("/fundamentals/{ticker}")
def get_fundamentals(ticker: str, db: Session = Depends(get_db)):
    """Get fundamental data for a ticker."""
    ticker = ticker.upper()

    fund = (
        db.query(Fundamental)
        .filter(Fundamental.ticker == ticker)
        .order_by(Fundamental.date_fetched.desc())
        .first()
    )

    if not fund or (date.today() - fund.date_fetched).days > 7:
        fetch_fundamentals(ticker, session=db)
        fund = (
            db.query(Fundamental)
            .filter(Fundamental.ticker == ticker)
            .order_by(Fundamental.date_fetched.desc())
            .first()
        )

    if not fund:
        raise HTTPException(status_code=404, detail=f"No fundamentals found for {ticker}")

    return {
        "ticker": ticker,
        "date_fetched": str(fund.date_fetched),
        "market_cap": fund.market_cap,
        "pe_ratio": fund.pe_ratio,
        "pb_ratio": fund.pb_ratio,
        "ps_ratio": fund.ps_ratio,
        "peg_ratio": fund.peg_ratio,
        "ev_to_ebitda": fund.ev_to_ebitda,
        "roe": fund.roe,
        "roa": fund.roa,
        "debt_to_equity": fund.debt_to_equity,
        "current_ratio": fund.current_ratio,
        "free_cash_flow": fund.free_cash_flow,
        "revenue_growth": fund.revenue_growth,
        "earnings_growth": fund.earnings_growth,
        "dividend_yield": fund.dividend_yield,
        "sector": fund.sector,
        "industry": fund.industry,
    }


@router.get("/macro")
def get_macro_indicators(db: Session = Depends(get_db)):
    """Get latest macro indicators."""
    # Friendly names used in the DB (see ingestion/fred.py FRED_SERIES)
    MACRO_NAMES = ["GDP", "CPI", "unemployment_rate", "fed_funds_rate", "10y_yield", "2y_yield", "VIX"]

    indicators = {}
    for name in MACRO_NAMES:
        latest = (
            db.query(MacroIndicator)
            .filter(MacroIndicator.indicator_name == name)
            .order_by(MacroIndicator.date.desc())
            .first()
        )
        if latest:
            indicators[name] = {"value": latest.value, "date": str(latest.date)}

    if not indicators:
        fetch_macro_indicators(db)
        for name in MACRO_NAMES:
            latest = (
                db.query(MacroIndicator)
                .filter(MacroIndicator.indicator_name == name)
                .order_by(MacroIndicator.date.desc())
                .first()
            )
            if latest:
                indicators[name] = {"value": latest.value, "date": str(latest.date)}

    return {"indicators": indicators}


@router.get("/news/{ticker}")
def get_news(
    ticker: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get news sentiment for a ticker."""
    ticker = ticker.upper()

    news = (
        db.query(NewsSentiment)
        .filter(NewsSentiment.ticker == ticker)
        .order_by(NewsSentiment.date.desc())
        .limit(limit)
        .all()
    )

    if not news:
        fetch_news(ticker, session=db)
        news = (
            db.query(NewsSentiment)
            .filter(NewsSentiment.ticker == ticker)
            .order_by(NewsSentiment.date.desc())
            .limit(limit)
            .all()
        )

    return {
        "ticker": ticker,
        "count": len(news),
        "articles": [
            {
                "date": str(n.date),
                "headline": n.headline,
                "source": n.source,
                "sentiment_score": n.sentiment_score,
                "summary": n.summary,
            }
            for n in news
        ],
    }


@router.post("/refresh/{ticker}")
def refresh_ticker_data(ticker: str, db: Session = Depends(get_db)):
    """Force refresh all data for a ticker."""
    ticker = ticker.upper()
    fetch_prices(ticker, period="1y", session=db)
    fetch_fundamentals(ticker, session=db)
    fetch_news(ticker, session=db)
    return {"status": "refreshed", "ticker": ticker}


@router.post("/refresh-macro")
def refresh_macro(db: Session = Depends(get_db)):
    """Force refresh macro indicators."""
    fetch_macro_indicators(db)
    return {"status": "refreshed"}
