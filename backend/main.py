import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db.database import init_db

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="US Market Intelligence AI Platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()

    if settings.scheduler_enabled:
        from ingestion.scheduler import start_scheduler
        start_scheduler()


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


# Register routers
from api.routes_market import router as market_router
from api.routes_analysis import router as analysis_router
from api.routes_portfolio import router as portfolio_router
from api.routes_ai import router as ai_router
from api.routes_regime import router as regime_router

app.include_router(market_router, prefix="/market", tags=["Market Data"])
app.include_router(analysis_router, prefix="/analysis", tags=["Analysis"])
app.include_router(portfolio_router, prefix="/portfolio", tags=["Portfolio"])
app.include_router(ai_router, prefix="/ai", tags=["AI Reasoning"])
app.include_router(regime_router, prefix="/regime", tags=["Regime Detection"])
