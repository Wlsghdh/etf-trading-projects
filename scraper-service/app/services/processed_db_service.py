#!/usr/bin/env python3
"""
Processed Database Service for etf2_db_processed.

Handles creating the processed feature database and upserting
feature-enriched DataFrames (96 features + target) from the FeaturePipeline.

Uses environment-variable based direct MySQL connection (same as MySQLProvider),
avoiding SSH tunnel dependency.
"""

import os
import logging
import numpy as np
import pandas as pd
from typing import List, Optional

from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Raw OHLCV columns stored alongside features
RAW_OHLCV_COLS = ["open", "high", "low", "close", "volume", "dividends", "stock_splits"]


def _build_db_url(db_name: str) -> str:
    """Build MySQL URL from environment variables."""
    # Try DB_URL or MYSQL_URL
    for env_key in ("DB_URL", "MYSQL_URL"):
        base_url = os.getenv(env_key)
        if base_url:
            parts = base_url.rsplit("/", 1)
            return f"{parts[0]}/{db_name}"

    host = os.getenv("MYSQL_HOST", "172.17.0.1")
    port = os.getenv("MYSQL_PORT", "3306")
    user = os.getenv("MYSQL_USER", "ahnbi2")
    password = os.getenv("MYSQL_PASSWORD", "bigdata")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{db_name}"


class ProcessedDatabaseService:
    """Service for writing processed feature data to etf2_db_processed.

    Uses the same env-var connection pattern as MySQLProvider:
        MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD (or MYSQL_URL)
    """

    DB_NAME = "etf2_db_processed"

    def __init__(self, db_url: Optional[str] = None):
        self._db_url = db_url or _build_db_url(self.DB_NAME)
        self._engine = None

    @property
    def engine(self):
        if self._engine is None:
            self._engine = create_engine(self._db_url, pool_pre_ping=True, pool_recycle=3600)
        return self._engine

    def close(self):
        if self._engine is not None:
            self._engine.dispose()
            self._engine = None

    # ------------------------------------------------------------------
    # Database / table DDL
    # ------------------------------------------------------------------

    def create_database(self):
        """Create etf2_db_processed database if it doesn't exist."""
        # Connect without a specific database
        no_db_url = self._db_url.rsplit("/", 1)[0] + "/"
        tmp_engine = create_engine(no_db_url)
        try:
            with tmp_engine.connect() as conn:
                conn.execute(
                    text("CREATE DATABASE IF NOT EXISTS `etf2_db_processed` "
                         "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                )
                conn.commit()
            logger.info("Ensured database etf2_db_processed exists")
        finally:
            tmp_engine.dispose()

    def table_exists(self, table_name: str) -> bool:
        with self.engine.connect() as conn:
            result = conn.execute(
                text(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
                    "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl"
                ),
                {"db": self.DB_NAME, "tbl": table_name},
            )
            return result.scalar() > 0

    def create_processed_table(self, table_name: str, feature_cols: List[str]):
        """Create a processed-feature table with dynamic columns.

        Args:
            table_name: e.g. "AAPL_D"
            feature_cols: list of feature column names (ALL_FEATURE_COLS)
        """
        if self.table_exists(table_name):
            return

        col_defs = [
            "`time` DATETIME NOT NULL",
            "`symbol` VARCHAR(32) NOT NULL",
            "`timeframe` VARCHAR(16) NOT NULL",
        ]

        # Raw OHLCV
        for col in RAW_OHLCV_COLS:
            if col == "volume":
                col_defs.append(f"`{col}` BIGINT")
            else:
                col_defs.append(f"`{col}` DOUBLE")

        # Feature columns (all DOUBLE)
        for col in feature_cols:
            if col not in RAW_OHLCV_COLS:
                col_defs.append(f"`{col}` DOUBLE")

        # Target columns
        col_defs.append("`target_3m` DOUBLE")
        col_defs.append("`target_date` DATETIME")

        # Metadata
        col_defs.append(
            "`processed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP "
            "ON UPDATE CURRENT_TIMESTAMP"
        )
        col_defs.append("PRIMARY KEY (`symbol`, `timeframe`, `time`)")

        ddl = (
            f"CREATE TABLE `{table_name}` (\n"
            + ",\n".join(f"  {d}" for d in col_defs)
            + "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        )

        with self.engine.connect() as conn:
            conn.execute(text(ddl))
            conn.commit()
        logger.info(f"Created processed table {table_name}")

    # ------------------------------------------------------------------
    # Upsert
    # ------------------------------------------------------------------

    def upsert_dataframe(
        self,
        df: pd.DataFrame,
        symbol: str,
        timeframe: str,
        feature_cols: List[str],
    ) -> int:
        """Upsert a DataFrame of processed features into the target table.

        Args:
            df: DataFrame with 'date' (or 'time') column + feature columns
            symbol: Stock symbol
            timeframe: e.g. "D"
            feature_cols: ALL_FEATURE_COLS used for table schema

        Returns:
            Number of rows upserted
        """
        table_name = f"{symbol}_{timeframe}"
        self.create_processed_table(table_name, feature_cols)

        if df.empty:
            logger.warning(f"Empty DataFrame for {symbol}, skipping")
            return 0

        df = df.copy()

        # Normalise date column
        if "date" in df.columns and "time" not in df.columns:
            df["time"] = pd.to_datetime(df["date"])
        elif "time" in df.columns:
            df["time"] = pd.to_datetime(df["time"])

        df["symbol"] = symbol
        df["timeframe"] = timeframe

        # Determine which columns to write
        schema_cols = (
            ["time", "symbol", "timeframe"]
            + RAW_OHLCV_COLS
            + [c for c in feature_cols if c not in RAW_OHLCV_COLS]
            + ["target_3m", "target_date"]
        )
        write_cols = [c for c in schema_cols if c in df.columns]

        # Replace inf with NaN, then convert to records
        df = df.replace([np.inf, -np.inf], np.nan)
        raw_records = df[write_cols].to_dict("records")

        # Explicitly convert NaN/NaT → None at Python dict level
        # (pandas keeps NaN for floats and NaT for datetimes)
        import math
        records = []
        for rec in raw_records:
            cleaned = {}
            for k, v in rec.items():
                if v is pd.NaT:
                    cleaned[k] = None
                elif isinstance(v, float) and math.isnan(v):
                    cleaned[k] = None
                elif isinstance(v, np.floating) and np.isnan(v):
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            records.append(cleaned)

        if not records:
            return 0

        # Build INSERT ... ON DUPLICATE KEY UPDATE
        col_list = ", ".join(f"`{c}`" for c in write_cols)
        param_list = ", ".join(f":{c}" for c in write_cols)
        pk_cols = {"time", "symbol", "timeframe"}
        update_list = ", ".join(
            f"`{c}` = VALUES(`{c}`)" for c in write_cols if c not in pk_cols
        )

        insert_sql = text(
            f"INSERT INTO `{table_name}` ({col_list}) "
            f"VALUES ({param_list}) "
            f"ON DUPLICATE KEY UPDATE {update_list}"
        )

        batch_size = 500
        with self.engine.connect() as conn:
            for i in range(0, len(records), batch_size):
                batch = records[i : i + batch_size]
                for record in batch:
                    conn.execute(insert_sql, record)
                conn.commit()

        logger.info(f"Upserted {len(records)} rows into {table_name}")
        return len(records)
