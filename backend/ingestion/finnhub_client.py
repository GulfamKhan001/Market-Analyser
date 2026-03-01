"""
Finnhub news and sentiment ingestion.
Fetches company news headlines and computes a simple keyword-based
sentiment score for each article.
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional

import finnhub
from sqlalchemy.orm import Session

from config import get_settings
from db.database import SessionLocal
from db.models import NewsSentiment

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Simple keyword-based sentiment scoring ───────────────────────────────────

POSITIVE_KEYWORDS = {
    "upgrade", "beat", "beats", "surge", "surges", "rally", "rallies",
    "gain", "gains", "profit", "record", "bullish", "strong", "growth",
    "outperform", "buy", "positive", "boost", "boosts", "rises", "rise",
    "soar", "soars", "high", "breakout", "upside", "optimism", "recovery",
    "expand", "expands", "exceeded", "exceeds", "above", "tops",
}

NEGATIVE_KEYWORDS = {
    "downgrade", "miss", "misses", "drop", "drops", "fall", "falls",
    "loss", "losses", "decline", "declines", "bearish", "weak", "cut",
    "cuts", "sell", "negative", "crash", "crashes", "plunge", "plunges",
    "low", "risk", "warning", "warns", "layoff", "layoffs", "below",
    "bankruptcy", "default", "investigation", "fraud", "recession",
    "underperform", "downturn", "slump", "slumps",
}


def compute_headline_sentiment(headline: str) -> float:
    """
    Compute a simple sentiment score from a headline using keyword matching.

    Returns a float between -1.0 (very negative) and 1.0 (very positive).
    A score of 0.0 means neutral or no keywords matched.
    """
    if not headline:
        return 0.0

    words = set(headline.lower().split())
    pos_count = len(words & POSITIVE_KEYWORDS)
    neg_count = len(words & NEGATIVE_KEYWORDS)
    total = pos_count + neg_count

    if total == 0:
        return 0.0

    return round((pos_count - neg_count) / total, 4)


def _get_finnhub_client() -> finnhub.Client:
    """Create a Finnhub API client using the configured API key."""
    if not settings.finnhub_api_key:
        raise ValueError(
            "Finnhub API key is not configured. Set FINNHUB_API_KEY in your .env file."
        )
    return finnhub.Client(api_key=settings.finnhub_api_key)


def _upsert_news(session: Session, ticker: str, article: dict) -> None:
    """Insert a news article if it does not already exist (by headline + date)."""
    headline = article.get("headline", "").strip()
    if not headline:
        return

    pub_datetime = datetime.fromtimestamp(article.get("datetime", 0))

    existing = (
        session.query(NewsSentiment)
        .filter(
            NewsSentiment.ticker == ticker,
            NewsSentiment.headline == headline,
            NewsSentiment.date == pub_datetime,
        )
        .first()
    )

    sentiment = compute_headline_sentiment(headline)
    source = article.get("source", "")
    url = article.get("url", "")
    summary = article.get("summary", "")

    if existing:
        existing.sentiment_score = sentiment
        existing.source = source
        existing.url = url
        existing.summary = summary
    else:
        session.add(NewsSentiment(
            ticker=ticker,
            date=pub_datetime,
            headline=headline,
            source=source,
            url=url,
            sentiment_score=sentiment,
            relevance_score=article.get("relevance", 1.0),
            summary=summary[:2000] if summary else None,
        ))


def fetch_news(
    ticker: str,
    session: Optional[Session] = None,
    days_back: int = 7,
) -> int:
    """
    Fetch recent company news for a ticker from Finnhub and persist it.

    Args:
        ticker: Stock symbol (e.g. "AAPL").
        session: SQLAlchemy session. A new one is created if None.
        days_back: Number of days of news to fetch (default 7).

    Returns:
        Number of articles upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    try:
        client = _get_finnhub_client()

        date_to = date.today()
        date_from = date_to - timedelta(days=days_back)

        logger.info(
            "Fetching Finnhub news for %s from %s to %s",
            ticker,
            date_from.isoformat(),
            date_to.isoformat(),
        )

        articles = client.company_news(
            ticker,
            _from=date_from.strftime("%Y-%m-%d"),
            to=date_to.strftime("%Y-%m-%d"),
        )

        if not articles:
            logger.warning("No news articles returned for %s", ticker)
            return 0

        count = 0
        for article in articles:
            _upsert_news(session, ticker, article)
            count += 1

        session.commit()
        logger.info("Upserted %d news articles for %s", count, ticker)
        return count

    except Exception as e:
        session.rollback()
        logger.error("Error fetching news for %s: %s", ticker, e)
        raise
    finally:
        if own_session:
            session.close()


def bulk_fetch_news(
    tickers: list[str],
    session: Optional[Session] = None,
    days_back: int = 7,
) -> dict[str, int]:
    """
    Fetch news for multiple tickers, sharing a single session.

    Args:
        tickers: List of stock symbols.
        session: SQLAlchemy session. A new one is created if None.
        days_back: Number of days of news to fetch.

    Returns:
        Dict mapping ticker -> number of articles upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    results: dict[str, int] = {}
    try:
        for ticker in tickers:
            try:
                count = fetch_news(ticker, session=session, days_back=days_back)
                results[ticker] = count
            except Exception as e:
                logger.error("Skipping news for %s due to error: %s", ticker, e)
                results[ticker] = 0
        return results
    finally:
        if own_session:
            session.close()
