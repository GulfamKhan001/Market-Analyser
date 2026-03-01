from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # App
    app_name: str = "Market Intelligence API"
    debug: bool = True

    # Database
    database_url: str = "sqlite:///./market_analyser.db"

    # API Keys
    fred_api_key: str = ""
    finnhub_api_key: str = ""
    alpha_vantage_api_key: str = ""
    anthropic_api_key: str = ""

    # AI Model Config
    ai_model_screening: str = "claude-haiku-4-5-20251001"
    ai_model_deep: str = "claude-sonnet-4-6"
    ai_cache_hours: int = 24

    # Scheduler
    market_close_hour_utc: int = 21  # 4 PM ET = 21:00 UTC
    scheduler_enabled: bool = True

    # Portfolio Defaults
    max_position_pct: float = 0.10  # 10% max per position
    kelly_fraction: float = 0.5  # Half-Kelly

    # Watchlist default tickers
    default_tickers: list[str] = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
        "JPM", "V", "JNJ", "UNH", "XOM", "PG", "HD", "MA",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
