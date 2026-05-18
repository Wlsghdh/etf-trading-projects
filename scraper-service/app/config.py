"""Configuration settings for scraper service."""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Database
    db_url: str = "mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db"

    # Directories
    log_dir: str = "/app/logs"
    download_dir: str = "/app/downloads"
    cookies_file: str = "/app/cookies/cookies.json"

    # TradingView credentials
    tradingview_username: str = ""
    tradingview_password: str = ""

    # Scraper settings
    headless: bool = True
    max_retries: int = 3

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
