from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite only
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from db.models import (
        StockPrice, Fundamental, MacroIndicator, TechnicalSignal,
        RegimeState, PortfolioPosition, PortfolioSnapshot,
        AIAnalysis, NewsSentiment,
    )
    Base.metadata.create_all(bind=engine)
