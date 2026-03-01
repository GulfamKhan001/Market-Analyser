"""
APScheduler-based task scheduler for periodic data ingestion.
Runs a daily refresh job after US market close (21:00 UTC / 4 PM ET).
"""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import get_settings
from db.database import SessionLocal
from ingestion.yahoo import bulk_fetch_prices, fetch_fundamentals
from ingestion.fred import fetch_macro_indicators
from ingestion.finnhub_client import bulk_fetch_news

logger = logging.getLogger(__name__)
settings = get_settings()

# Global scheduler instance
_scheduler: BackgroundScheduler | None = None


def daily_data_refresh() -> None:
    """
    Master job that runs once per day after market close.

    Steps:
        1. Fetch latest prices for all default tickers (last 5 days to
           fill any gaps from weekends/holidays).
        2. Fetch fundamentals for all default tickers.
        3. Fetch macro indicators from FRED.
        4. Fetch news for the top 10 default tickers.
    """
    logger.info("Starting daily data refresh at %s", datetime.utcnow().isoformat())
    session = SessionLocal()

    try:
        # ── 1. Prices ────────────────────────────────────────────────────
        tickers = settings.default_tickers
        logger.info("Fetching prices for %d tickers", len(tickers))
        try:
            price_results = bulk_fetch_prices(tickers, period="5d", session=session)
            logger.info("Price fetch results: %s", price_results)
        except Exception as e:
            logger.error("Price fetch failed: %s", e)

        # ── 2. Fundamentals ──────────────────────────────────────────────
        logger.info("Fetching fundamentals for %d tickers", len(tickers))
        for ticker in tickers:
            try:
                fetch_fundamentals(ticker, session=session)
            except Exception as e:
                logger.error("Fundamentals fetch failed for %s: %s", ticker, e)

        # ── 3. Macro indicators ──────────────────────────────────────────
        logger.info("Fetching macro indicators from FRED")
        try:
            macro_results = fetch_macro_indicators(session=session)
            logger.info("Macro fetch results: %s", macro_results)
        except Exception as e:
            logger.error("Macro indicator fetch failed: %s", e)

        # ── 4. SPY for regime detection + beta ──────────────────────────
        logger.info("Fetching SPY prices for regime/beta")
        try:
            from ingestion.yahoo import fetch_prices
            fetch_prices("SPY", period="5d", session=session)
        except Exception as e:
            logger.error("SPY fetch failed: %s", e)

        # ── 5. News for top tickers ──────────────────────────────────────
        top_tickers = tickers[:10]
        logger.info("Fetching news for top %d tickers", len(top_tickers))
        try:
            news_results = bulk_fetch_news(top_tickers, session=session, days_back=1)
            logger.info("News fetch results: %s", news_results)
        except Exception as e:
            logger.error("News fetch failed: %s", e)

        # ── 6. Regime detection ──────────────────────────────────────────
        logger.info("Running regime detection")
        try:
            from analysis.regime import detect_regime
            regime = detect_regime(session)
            logger.info("Regime: %s", regime.get("regime_label"))
        except Exception as e:
            logger.error("Regime detection failed: %s", e)

        logger.info("Daily data refresh completed at %s", datetime.utcnow().isoformat())

    except Exception as e:
        logger.error("Daily data refresh encountered a fatal error: %s", e)
    finally:
        session.close()


def start_scheduler() -> BackgroundScheduler:
    """
    Create and start the APScheduler background scheduler.

    Schedules the daily_data_refresh job to run at the configured
    market_close_hour_utc (default 21:00 UTC).

    Returns:
        The running BackgroundScheduler instance.
    """
    global _scheduler

    if _scheduler is not None and _scheduler.running:
        logger.warning("Scheduler is already running")
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")

    if settings.scheduler_enabled:
        trigger = CronTrigger(
            hour=settings.market_close_hour_utc,
            minute=0,
            timezone="UTC",
        )
        _scheduler.add_job(
            daily_data_refresh,
            trigger=trigger,
            id="daily_data_refresh",
            name="Daily market data refresh",
            replace_existing=True,
            misfire_grace_time=3600,  # allow up to 1 hour late
        )
        logger.info(
            "Scheduled daily_data_refresh at %02d:00 UTC",
            settings.market_close_hour_utc,
        )
    else:
        logger.info("Scheduler is disabled via settings (scheduler_enabled=False)")

    _scheduler.start()
    logger.info("APScheduler started")
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler if it is running."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
        _scheduler = None


def trigger_refresh_now() -> None:
    """
    Manually trigger the daily data refresh immediately.
    Useful for testing or on-demand updates from an API endpoint.
    """
    logger.info("Manually triggering daily data refresh")
    daily_data_refresh()
