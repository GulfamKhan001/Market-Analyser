"""
Yahoo Finance data ingestion via yfinance.
Fetches historical prices and fundamental data for stocks.
"""

import logging
from datetime import date, datetime
from typing import Optional

import yfinance as yf
from sqlalchemy.orm import Session

from config import get_settings
from db.database import SessionLocal
from db.models import StockPrice, Fundamental

logger = logging.getLogger(__name__)
settings = get_settings()


def _upsert_price(session: Session, ticker: str, row: dict) -> None:
    """Insert or update a single price row, avoiding duplicates."""
    existing = (
        session.query(StockPrice)
        .filter(StockPrice.ticker == ticker, StockPrice.date == row["date"])
        .first()
    )
    if existing:
        existing.open = row["open"]
        existing.high = row["high"]
        existing.low = row["low"]
        existing.close = row["close"]
        existing.adj_close = row["adj_close"]
        existing.volume = row["volume"]
    else:
        session.add(StockPrice(
            ticker=ticker,
            date=row["date"],
            open=row["open"],
            high=row["high"],
            low=row["low"],
            close=row["close"],
            adj_close=row["adj_close"],
            volume=row["volume"],
        ))


def fetch_prices(
    ticker: str,
    period: str = "1y",
    session: Optional[Session] = None,
) -> int:
    """
    Fetch historical OHLCV prices for a single ticker from Yahoo Finance.

    Args:
        ticker: Stock symbol (e.g. "AAPL").
        period: yfinance period string ("1d", "5d", "1mo", "3mo", "6mo",
                "1y", "2y", "5y", "10y", "ytd", "max").
        session: SQLAlchemy session. A new one is created if None.

    Returns:
        Number of rows upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    try:
        logger.info("Fetching prices for %s (period=%s)", ticker, period)
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, auto_adjust=False)

        if df.empty:
            logger.warning("No price data returned for %s", ticker)
            return 0

        count = 0
        for idx, row in df.iterrows():
            price_date = idx.date() if hasattr(idx, "date") else idx
            _upsert_price(session, ticker, {
                "date": price_date,
                "open": round(float(row["Open"]), 4) if row["Open"] == row["Open"] else None,
                "high": round(float(row["High"]), 4) if row["High"] == row["High"] else None,
                "low": round(float(row["Low"]), 4) if row["Low"] == row["Low"] else None,
                "close": round(float(row["Close"]), 4) if row["Close"] == row["Close"] else None,
                "adj_close": round(float(row["Adj Close"]), 4) if row["Adj Close"] == row["Adj Close"] else None,
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else None,
            })
            count += 1

        session.commit()
        logger.info("Upserted %d price rows for %s", count, ticker)
        return count

    except Exception as e:
        session.rollback()
        logger.error("Error fetching prices for %s: %s", ticker, e)
        raise
    finally:
        if own_session:
            session.close()


def fetch_fundamentals(
    ticker: str,
    session: Optional[Session] = None,
) -> Optional[Fundamental]:
    """
    Fetch fundamental / valuation data for a single ticker from Yahoo Finance.

    Args:
        ticker: Stock symbol.
        session: SQLAlchemy session. A new one is created if None.

    Returns:
        The upserted Fundamental ORM object, or None on failure.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    try:
        logger.info("Fetching fundamentals for %s", ticker)
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info or info.get("regularMarketPrice") is None:
            logger.warning("No fundamental data returned for %s", ticker)
            return None

        today = date.today()

        # Check for existing record for this ticker + date
        existing = (
            session.query(Fundamental)
            .filter(Fundamental.ticker == ticker, Fundamental.date_fetched == today)
            .first()
        )

        def _safe_float(key: str) -> Optional[float]:
            val = info.get(key)
            if val is None:
                return None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        data = {
            "market_cap": _safe_float("marketCap"),
            "pe_ratio": _safe_float("trailingPE"),
            "pb_ratio": _safe_float("priceToBook"),
            "ps_ratio": _safe_float("priceToSalesTrailing12Months"),
            "peg_ratio": _safe_float("pegRatio"),
            "ev_to_ebitda": _safe_float("enterpriseToEbitda"),
            "roe": _safe_float("returnOnEquity"),
            "roa": _safe_float("returnOnAssets"),
            "debt_to_equity": _safe_float("debtToEquity"),
            "current_ratio": _safe_float("currentRatio"),
            "free_cash_flow": _safe_float("freeCashflow"),
            "revenue_growth": _safe_float("revenueGrowth"),
            "earnings_growth": _safe_float("earningsGrowth"),
            "dividend_yield": _safe_float("dividendYield"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
        }

        if existing:
            for key, value in data.items():
                setattr(existing, key, value)
            fundamental = existing
        else:
            fundamental = Fundamental(
                ticker=ticker,
                date_fetched=today,
                **data,
            )
            session.add(fundamental)

        session.commit()
        logger.info("Upserted fundamentals for %s", ticker)
        return fundamental

    except Exception as e:
        session.rollback()
        logger.error("Error fetching fundamentals for %s: %s", ticker, e)
        raise
    finally:
        if own_session:
            session.close()


def bulk_fetch_prices(
    tickers: list[str],
    period: str = "1y",
    session: Optional[Session] = None,
) -> dict[str, int]:
    """
    Fetch prices for multiple tickers sequentially, sharing a single session.

    Args:
        tickers: List of stock symbols.
        period: yfinance period string.
        session: SQLAlchemy session. A new one is created if None.

    Returns:
        Dict mapping ticker -> number of rows upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    results: dict[str, int] = {}
    try:
        for ticker in tickers:
            try:
                count = fetch_prices(ticker, period=period, session=session)
                results[ticker] = count
            except Exception as e:
                logger.error("Skipping %s due to error: %s", ticker, e)
                results[ticker] = 0
        return results
    finally:
        if own_session:
            session.close()
