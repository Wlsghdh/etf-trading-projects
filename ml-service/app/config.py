from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    # Remote MySQL (via SSH tunnel) - 172.17.0.1 = Docker bridge IP (Linux)
    remote_db_url: str = "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db"

    # Processed features DB
    processed_db_url: str = "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db_processed"

    # Local SQLite for predictions
    local_db_path: str = "/app/data/predictions.db"

    # API Settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"

    # ML Settings
    # Path to trained models directory (in container)
    models_dir: str = "/app/data/models"
    # Default model to use for predictions (ahnlab_lgbm)
    default_model: str = "ahnlab_lgbm"
    # Enable ML features
    enable_ml_features: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
