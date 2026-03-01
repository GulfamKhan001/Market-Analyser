"""
FRED (Federal Reserve Economic Data) ingestion via fredapi.
Fetches macro-economic indicators: GDP, CPI, unemployment, fed funds rate,
treasury yields (10Y, 2Y), and VIX.
"""

import logging
from datetime import date
from typing import Optional

from fredapi import Fred
from sqlalchemy.orm import Session

from config import get_settings
from db.database import SessionLocal
from db.models import MacroIndicator

logger = logging.getLogger(__name__)
settings = get_settings()

# FRED series mapping: friendly name -> FRED series ID
FRED_SERIES = {
    "GDP": "GDP",
    "CPI": "CPIAUCSL",
    "unemployment_rate": "UNRATE",
    "fed_funds_rate": "FEDFUNDS",
    "10y_yield": "DGS10",
    "2y_yield": "DGS2",
    "VIX": "VIXCLS",
}


def _get_fred_client() -> Fred:
    """Create a FRED API client using the configured API key."""
    if not settings.fred_api_key:
        raise ValueError(
            "FRED API key is not configured. Set FRED_API_KEY in your .env file."
        )
    return Fred(api_key=settings.fred_api_key)


def _upsert_macro_row(
    session: Session,
    indicator_name: str,
    obs_date: date,
    value: float,
) -> None:
    """Insert or update a single macro indicator observation."""
    existing = (
        session.query(MacroIndicator)
        .filter(
            MacroIndicator.indicator_name == indicator_name,
            MacroIndicator.date == obs_date,
        )
        .first()
    )
    if existing:
        existing.value = value
    else:
        session.add(MacroIndicator(
            indicator_name=indicator_name,
            date=obs_date,
            value=value,
        ))


def fetch_single_indicator(
    indicator_name: str,
    series_id: str,
    session: Optional[Session] = None,
    observation_start: Optional[str] = None,
    limit: int = 252,
) -> int:
    """
    Fetch a single FRED series and persist it.

    Args:
        indicator_name: Friendly name stored in the database.
        series_id: FRED series ID (e.g. "CPIAUCSL").
        session: SQLAlchemy session. A new one is created if None.
        observation_start: Start date string "YYYY-MM-DD". Defaults to
            roughly 1 year of data if not set.
        limit: Maximum number of recent observations to store.

    Returns:
        Number of rows upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    try:
        fred = _get_fred_client()
        logger.info("Fetching FRED series %s (%s)", series_id, indicator_name)

        kwargs = {}
        if observation_start:
            kwargs["observation_start"] = observation_start

        series = fred.get_series(series_id, **kwargs)

        if series is None or series.empty:
            logger.warning("No data returned for FRED series %s", series_id)
            return 0

        # Take the most recent `limit` observations
        series = series.dropna().tail(limit)

        count = 0
        for ts, value in series.items():
            obs_date = ts.date() if hasattr(ts, "date") else ts
            _upsert_macro_row(session, indicator_name, obs_date, round(float(value), 6))
            count += 1

        session.commit()
        logger.info("Upserted %d rows for %s", count, indicator_name)
        return count

    except Exception as e:
        session.rollback()
        logger.error("Error fetching FRED series %s: %s", series_id, e)
        raise
    finally:
        if own_session:
            session.close()


def fetch_macro_indicators(
    session: Optional[Session] = None,
) -> dict[str, int]:
    """
    Fetch all configured macro indicators from FRED and persist them.

    Fetches: GDP, CPI, unemployment rate, fed funds rate, 10-year yield,
    2-year yield, and VIX.

    Args:
        session: SQLAlchemy session. A new one is created if None.

    Returns:
        Dict mapping indicator name -> number of rows upserted.
    """
    own_session = session is None
    if own_session:
        session = SessionLocal()

    results: dict[str, int] = {}
    try:
        for indicator_name, series_id in FRED_SERIES.items():
            try:
                count = fetch_single_indicator(
                    indicator_name=indicator_name,
                    series_id=series_id,
                    session=session,
                )
                results[indicator_name] = count
            except Exception as e:
                logger.error(
                    "Skipping indicator %s due to error: %s", indicator_name, e
                )
                results[indicator_name] = 0

        return results

    finally:
        if own_session:
            session.close()
