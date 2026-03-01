"""
Portfolio manager — CRUD operations, price updates, CSV import, and snapshots.
"""

import csv
import logging
from datetime import date, datetime
from typing import Optional

import yfinance as yf
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from config import get_settings
from db.database import SessionLocal
from db.models import (
    PortfolioPosition, PortfolioSnapshot, StockPrice, Fundamental,
)

logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def add_position(
    session: Session,
    ticker: str,
    entry_date: date,
    entry_price: float,
    quantity: float,
    position_type: str = "long",
    notes: Optional[str] = None,
) -> PortfolioPosition:
    """Create a new portfolio position and return it."""
    # Try to pull sector from existing fundamentals
    fundamental = (
        session.query(Fundamental)
        .filter(Fundamental.ticker == ticker)
        .order_by(Fundamental.date_fetched.desc())
        .first()
    )
    sector = fundamental.sector if fundamental else None

    position = PortfolioPosition(
        ticker=ticker.upper(),
        entry_date=entry_date,
        entry_price=entry_price,
        quantity=quantity,
        position_type=position_type,
        sector=sector,
        notes=notes,
    )
    session.add(position)
    session.commit()
    session.refresh(position)
    logger.info("Added position: %s x%.2f @ %.2f", ticker, quantity, entry_price)
    return position


def update_position(
    session: Session,
    position_id: int,
    **kwargs,
) -> PortfolioPosition:
    """Update fields on an existing position. Returns the updated object."""
    position = session.query(PortfolioPosition).get(position_id)
    if position is None:
        raise ValueError(f"Position {position_id} not found")

    allowed = {
        "ticker", "entry_date", "entry_price", "quantity",
        "current_price", "unrealized_pnl", "sector",
        "position_type", "notes",
    }
    for key, value in kwargs.items():
        if key not in allowed:
            raise ValueError(f"Invalid field: {key}")
        setattr(position, key, value)

    position.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(position)
    logger.info("Updated position %d: %s", position_id, list(kwargs.keys()))
    return position


def delete_position(session: Session, position_id: int) -> bool:
    """Delete a position by ID. Returns True if deleted, False if not found."""
    position = session.query(PortfolioPosition).get(position_id)
    if position is None:
        return False
    session.delete(position)
    session.commit()
    logger.info("Deleted position %d", position_id)
    return True


def get_positions(session: Session) -> list[PortfolioPosition]:
    """Return all portfolio positions ordered by entry date descending."""
    return (
        session.query(PortfolioPosition)
        .order_by(PortfolioPosition.entry_date.desc())
        .all()
    )


def get_position(session: Session, position_id: int) -> PortfolioPosition:
    """Return a single position by ID or raise ValueError."""
    position = session.query(PortfolioPosition).get(position_id)
    if position is None:
        raise ValueError(f"Position {position_id} not found")
    return position


# ---------------------------------------------------------------------------
# Price updates
# ---------------------------------------------------------------------------

def update_current_prices(session: Session) -> None:
    """
    Use yfinance to fetch the latest price for every open position and
    update current_price / unrealized_pnl.
    """
    positions = get_positions(session)
    if not positions:
        logger.info("No positions to update")
        return

    tickers = list({p.ticker for p in positions})
    logger.info("Updating prices for %d tickers", len(tickers))

    # Batch download latest day of data
    try:
        data = yf.download(tickers, period="1d", progress=False)
    except Exception as e:
        logger.error("yfinance download failed: %s", e)
        return

    # Build ticker -> latest close mapping
    latest_prices: dict[str, float] = {}
    if len(tickers) == 1:
        # yf.download returns single-level columns for one ticker
        if not data.empty:
            latest_prices[tickers[0]] = float(data["Close"].iloc[-1])
    else:
        for t in tickers:
            try:
                price = float(data["Close"][t].dropna().iloc[-1])
                latest_prices[t] = price
            except (KeyError, IndexError):
                logger.warning("No price data for %s", t)

    for position in positions:
        price = latest_prices.get(position.ticker)
        if price is None:
            continue

        position.current_price = round(price, 4)

        if position.position_type == "long":
            position.unrealized_pnl = round(
                (price - position.entry_price) * position.quantity, 2,
            )
        elif position.position_type == "short":
            position.unrealized_pnl = round(
                (position.entry_price - price) * position.quantity, 2,
            )

    session.commit()
    logger.info("Updated current prices for %d positions", len(positions))


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------

def import_from_csv(session: Session, file_path: str) -> list[PortfolioPosition]:
    """
    Bulk-import positions from a CSV file.

    Expected columns: ticker, entry_date, entry_price, quantity, position_type
    entry_date format: YYYY-MM-DD
    """
    imported: list[PortfolioPosition] = []

    with open(file_path, newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                position = add_position(
                    session,
                    ticker=row["ticker"].strip(),
                    entry_date=datetime.strptime(
                        row["entry_date"].strip(), "%Y-%m-%d",
                    ).date(),
                    entry_price=float(row["entry_price"]),
                    quantity=float(row["quantity"]),
                    position_type=row.get("position_type", "long").strip(),
                )
                imported.append(position)
            except Exception as e:
                logger.error("Skipping CSV row %s: %s", row, e)

    logger.info("Imported %d positions from %s", len(imported), file_path)
    return imported


# ---------------------------------------------------------------------------
# Portfolio summary
# ---------------------------------------------------------------------------

def get_portfolio_summary(session: Session) -> dict:
    """
    Compute a high-level portfolio summary.

    Returns:
        dict with total_value, total_pnl, position_count, sector_allocation.
    """
    positions = get_positions(session)

    total_value = 0.0
    total_pnl = 0.0
    sector_values: dict[str, float] = {}

    for p in positions:
        price = p.current_price if p.current_price else p.entry_price
        market_value = price * p.quantity
        total_value += market_value
        total_pnl += p.unrealized_pnl if p.unrealized_pnl else 0.0

        sector = p.sector or "Unknown"
        sector_values[sector] = sector_values.get(sector, 0.0) + market_value

    # Convert sector values to allocation percentages
    sector_allocation: dict[str, float] = {}
    if total_value > 0:
        sector_allocation = {
            s: round(v / total_value * 100, 2) for s, v in sector_values.items()
        }

    return {
        "total_value": round(total_value, 2),
        "total_pnl": round(total_pnl, 2),
        "position_count": len(positions),
        "sector_allocation": sector_allocation,
    }


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------

def take_snapshot(session: Session) -> PortfolioSnapshot:
    """
    Create a PortfolioSnapshot row capturing today's portfolio metrics.

    If a snapshot already exists for today it will be updated in place.
    """
    from portfolio.risk import compute_risk_metrics

    today = date.today()
    summary = get_portfolio_summary(session)

    # Compute risk metrics (may return empty dict if insufficient data)
    try:
        risk = compute_risk_metrics(session)
    except Exception as e:
        logger.warning("Could not compute risk metrics for snapshot: %s", e)
        risk = {}

    # Compute daily return from the two most recent snapshots
    prev_snapshot = (
        session.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.date < today)
        .order_by(PortfolioSnapshot.date.desc())
        .first()
    )
    daily_return = None
    if prev_snapshot and prev_snapshot.total_value and prev_snapshot.total_value > 0:
        daily_return = round(
            (summary["total_value"] - prev_snapshot.total_value)
            / prev_snapshot.total_value,
            6,
        )

    # Upsert
    snapshot = (
        session.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.date == today)
        .first()
    )
    if snapshot is None:
        snapshot = PortfolioSnapshot(date=today)
        session.add(snapshot)

    snapshot.total_value = summary["total_value"]
    snapshot.daily_return = daily_return
    snapshot.drawdown = risk.get("max_drawdown")
    snapshot.var_95 = risk.get("var_95")
    snapshot.cvar_95 = risk.get("cvar_95")
    snapshot.sharpe_ratio = risk.get("sharpe_ratio")
    snapshot.sortino_ratio = risk.get("sortino_ratio")
    snapshot.beta = risk.get("beta")
    snapshot.sector_allocations_json = summary["sector_allocation"]

    session.commit()
    session.refresh(snapshot)
    logger.info("Snapshot saved for %s — value=%.2f", today, summary["total_value"])
    return snapshot
