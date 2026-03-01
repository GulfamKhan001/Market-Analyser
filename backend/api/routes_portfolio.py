from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from typing import Optional
import tempfile
import os

from db.database import get_db
from portfolio.manager import (
    add_position, update_position, delete_position,
    get_positions, get_position, update_current_prices,
    get_portfolio_summary, take_snapshot, import_from_csv,
)
from portfolio.risk import compute_risk_metrics
from portfolio.optimizer import suggest_position_size, optimize_allocation

router = APIRouter()


class PositionCreate(BaseModel):
    ticker: str
    entry_date: date
    entry_price: float
    quantity: float
    position_type: str = "long"
    notes: Optional[str] = None


class PositionUpdate(BaseModel):
    entry_price: Optional[float] = None
    quantity: Optional[float] = None
    position_type: Optional[str] = None
    notes: Optional[str] = None


@router.get("/positions")
def list_positions(db: Session = Depends(get_db)):
    """List all portfolio positions."""
    positions = get_positions(db)
    return {
        "count": len(positions),
        "positions": [
            {
                "id": p.id,
                "ticker": p.ticker,
                "entry_date": str(p.entry_date),
                "entry_price": p.entry_price,
                "quantity": p.quantity,
                "current_price": p.current_price,
                "unrealized_pnl": p.unrealized_pnl,
                "sector": p.sector,
                "position_type": p.position_type,
                "notes": p.notes,
            }
            for p in positions
        ],
    }


@router.post("/positions")
def create_position(pos: PositionCreate, db: Session = Depends(get_db)):
    """Add a new portfolio position."""
    position = add_position(
        db,
        ticker=pos.ticker.upper(),
        entry_date=pos.entry_date,
        entry_price=pos.entry_price,
        quantity=pos.quantity,
        position_type=pos.position_type,
        notes=pos.notes,
    )
    return {"id": position.id, "ticker": position.ticker, "status": "created"}


@router.put("/positions/{position_id}")
def modify_position(position_id: int, pos: PositionUpdate, db: Session = Depends(get_db)):
    """Update an existing position."""
    updates = pos.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    position = update_position(db, position_id, **updates)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"id": position.id, "status": "updated"}


@router.delete("/positions/{position_id}")
def remove_position(position_id: int, db: Session = Depends(get_db)):
    """Delete a portfolio position."""
    success = delete_position(db, position_id)
    if not success:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"status": "deleted"}


@router.post("/refresh-prices")
def refresh_prices(db: Session = Depends(get_db)):
    """Update current prices for all positions."""
    update_current_prices(db)
    return {"status": "prices updated"}


@router.get("/summary")
def portfolio_summary(db: Session = Depends(get_db)):
    """Get portfolio summary with allocations."""
    update_current_prices(db)
    return get_portfolio_summary(db)


@router.get("/risk")
def portfolio_risk(db: Session = Depends(get_db)):
    """Get portfolio risk metrics."""
    return compute_risk_metrics(db)


@router.get("/optimize")
def portfolio_optimize(db: Session = Depends(get_db)):
    """Get optimized allocation suggestions."""
    return optimize_allocation(db)


@router.get("/position-size/{ticker}")
def position_sizing(ticker: str, db: Session = Depends(get_db)):
    """Get suggested position size for a ticker."""
    return suggest_position_size(ticker.upper(), db)


@router.post("/snapshot")
def create_snapshot(db: Session = Depends(get_db)):
    """Take a portfolio snapshot."""
    take_snapshot(db)
    return {"status": "snapshot created"}


@router.post("/import-csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import positions from CSV file."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        count = import_from_csv(db, tmp_path)
        return {"status": "imported", "positions_added": count}
    finally:
        os.unlink(tmp_path)
