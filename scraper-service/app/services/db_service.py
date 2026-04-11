#!/usr/bin/env python3
"""
Database Service for TradingView Data Upload (Container Version)

기존 data-scraping/db_service.py 코드를 그대로 가져와서
컨테이너 환경에 맞게 최소한의 수정만 적용한 버전.

변경사항:
- SSH 터널 제거 (host.docker.internal 사용)
- volume NULL 값 처리 추가
"""

import os
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional
from datetime import datetime
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for uploading TradingView CSV data to remote MySQL database"""

    def __init__(
        self,
        db_url: Optional[str] = None,
        db_user: str = "ahnbi2",
        db_password: str = "bigdata",
        db_host: str = "host.docker.internal",
        db_port: int = 3306,
        db_name: str = "etf2_db",
    ):
        """
        Initialize database service.

        Args:
            db_url: Full database URL (overrides other params if provided)
            db_user: MySQL username
            db_password: MySQL password
            db_host: MySQL host (default: host.docker.internal for container)
            db_port: MySQL port
            db_name: MySQL database name
        """
        # Use environment variable or construct URL
        self.db_url = db_url or os.getenv(
            "DB_URL",
            f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        )
        self.db_name = db_name
        self.engine = None
        self.Session = None

    def connect(self):
        """Establish connection to database"""
        try:
            logger.info(f"Connecting to database...")

            self.engine = create_engine(
                self.db_url,
                pool_pre_ping=True,
                pool_recycle=3600,
                echo=False
            )
            self.Session = sessionmaker(bind=self.engine)

            # Test connection
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                result.fetchone()
            logger.info("Database connection successful")

        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            self.close()
            raise

    def close(self):
        """Close database connection"""
        if self.engine:
            self.engine.dispose()
            self.engine = None
            logger.info("Database connection closed")

    @contextmanager
    def get_session(self):
        """Get database session context manager"""
        session = self.Session()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_table_name(self, symbol: str, timeframe: str) -> str:
        """
        Get table name for a symbol and timeframe.

        Args:
            symbol: Stock symbol (e.g., AAPL, NVDA)
            timeframe: Time period (e.g., D, 1h, 10m)

        Returns:
            Table name in format {symbol}_{timeframe}
        """
        # Map common period names to DB conventions (기존 코드와 동일)
        timeframe_map = {
            "12개월": "D",
            "12달": "D",
            "1개월": "30m",
            "1달": "30m",
            "1주": "5m",
            "1일": "1m",
            "1시간": "10m",
            "10분": "1m",
        }

        tf = timeframe_map.get(timeframe, timeframe)
        return f"{symbol}_{tf}"

    def table_exists(self, table_name: str) -> bool:
        """Check if table exists in database"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = :db_name AND TABLE_NAME = :table_name
            """),
                {"db_name": self.db_name, "table_name": table_name},
            )
            count = result.scalar()
            return count > 0

    def create_table_if_not_exists(self, table_name: str):
        """Create table for stock data if it doesn't exist"""
        if self.table_exists(table_name):
            logger.debug(f"Table {table_name} already exists")
            return

        create_sql = f"""
        CREATE TABLE `{table_name}` (
            `time` DATETIME NOT NULL,
            `symbol` VARCHAR(32) NOT NULL,
            `timeframe` VARCHAR(16) NOT NULL,
            `open` DOUBLE,
            `high` DOUBLE,
            `low` DOUBLE,
            `close` DOUBLE,
            `volume` BIGINT,
            `rsi` DOUBLE,
            `macd` DOUBLE,
            PRIMARY KEY (`time`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """

        with self.engine.connect() as conn:
            conn.execute(text(create_sql))
            conn.commit()
        logger.info(f"Created table {table_name}")

    def parse_tradingview_csv(self, csv_path: Path) -> pd.DataFrame:
        """
        Parse TradingView exported CSV file. (기존 코드와 동일)

        Expected columns: time, open, high, low, close, volume
        Optional: Any indicator columns

        Args:
            csv_path: Path to CSV file

        Returns:
            DataFrame with parsed data
        """
        df = pd.read_csv(csv_path)

        # Standardize column names
        df.columns = df.columns.str.lower().str.strip()

        # Parse time column
        if "time" in df.columns:
            if pd.api.types.is_numeric_dtype(df["time"]):
                df["time"] = pd.to_datetime(df["time"], unit="s")
            else:
                df["time"] = pd.to_datetime(df["time"])
        elif "date" in df.columns:
            if pd.api.types.is_numeric_dtype(df["date"]):
                df["time"] = pd.to_datetime(df["date"], unit="s")
            else:
                df["time"] = pd.to_datetime(df["date"])
            df.drop("date", axis=1, inplace=True)

        # Ensure required columns exist
        required_cols = ["time", "open", "high", "low", "close"]
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        # Add volume if missing
        if "volume" not in df.columns:
            df["volume"] = 0

        # Add RSI and MACD as null if not present
        if "rsi" not in df.columns:
            df["rsi"] = np.nan
        if "macd" not in df.columns:
            df["macd"] = np.nan

        # Select only the columns we need
        df = df[["time", "open", "high", "low", "close", "volume", "rsi", "macd"]]

        # Convert numeric columns
        for col in ["open", "high", "low", "close", "volume", "rsi", "macd"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Drop rows with null time
        df = df.dropna(subset=["time"])

        # Sort by time
        df = df.sort_values("time").reset_index(drop=True)

        return df

    def _detect_csv_timeframe(self, df: pd.DataFrame) -> str:
        """
        CSV 데이터의 실제 타임프레임을 시간 간격으로 감지.

        Returns:
            감지된 타임프레임 코드 ('D', '30m', '5m', '1m', 'unknown')
        """
        if len(df) < 3:
            return "unknown"

        # 시간 차이 계산 (초 단위)
        time_diffs = df["time"].diff().dropna().dt.total_seconds()
        # 0 이하 제거 (중복/정렬 이슈)
        time_diffs = time_diffs[time_diffs > 0]

        if len(time_diffs) == 0:
            return "unknown"

        median_diff = time_diffs.median()

        # 일봉: 중앙값이 12시간(43200초) 이상
        if median_diff >= 43200:
            return "D"
        # 30분봉: 중앙값이 15분~3시간
        elif 900 <= median_diff < 10800:
            return "30m"
        # 5분봉: 중앙값이 2분~15분
        elif 120 <= median_diff < 900:
            return "5m"
        # 1분봉: 중앙값이 2분 미만
        elif median_diff < 120:
            return "1m"
        else:
            return "unknown"

    def _validate_csv_for_daily(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """
        _D 테이블에 삽입 전: intraday 데이터를 필터링하고 하루 1행만 유지.

        - 하루에 여러 행이 있으면 마지막 행(장 마감 가격)만 유지
        - 가격 이상치 필터링 (같은 날 max/min 비율이 3배 초과하면 경고)

        Returns:
            정제된 DataFrame
        """
        original_len = len(df)

        # 날짜 컬럼 추가
        df["_date"] = df["time"].dt.date

        # 하루에 여러 행이 있는지 체크
        rows_per_day = df.groupby("_date").size()
        multi_row_days = (rows_per_day > 1).sum()

        if multi_row_days > 0:
            logger.warning(
                f"[{symbol}] _D 테이블: {multi_row_days}일에 intraday 데이터 감지 "
                f"(총 {original_len}행). 하루 마지막 행만 유지합니다."
            )
            # 각 날짜의 마지막 행만 유지 (장 마감 가격)
            df = df.sort_values("time").groupby("_date").last().reset_index()
            # time 컬럼을 날짜 00:00:00 으로 정규화
            df["time"] = pd.to_datetime(df["_date"])
            logger.info(f"[{symbol}] 정제 후: {len(df)}행 (원본 {original_len}행)")

        df = df.drop(columns=["_date"])
        return df

    def _validate_price_sanity(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """
        가격 이상치 필터링: 연속된 행 대비 가격이 10배 이상 변동하면 제거.
        다른 종목 데이터가 섞여 있는 경우를 감지/제거.
        """
        if len(df) < 3:
            return df

        original_len = len(df)

        # 연속 close 비율 계산
        df = df.sort_values("time").reset_index(drop=True)
        close_ratio = df["close"] / df["close"].shift(1)

        # 10배 이상 급변하는 행 마킹 (상승 또는 하락)
        anomaly_mask = (close_ratio > 10) | (close_ratio < 0.1)
        # 첫 행은 비교 불가이므로 제외
        anomaly_mask.iloc[0] = False

        anomaly_count = anomaly_mask.sum()
        if anomaly_count > 0:
            # 이상치 행의 인접 행도 함께 제거 (연속 이상 구간)
            # 이상치 시작점 찾기
            anomaly_indices = df.index[anomaly_mask].tolist()

            # 이상 구간: 이상치부터 다음 정상 복귀까지
            to_remove = set()
            for idx in anomaly_indices:
                to_remove.add(idx)
                # 이상치 이후 행도 체크 (다시 원래 가격대로 돌아오는 지점까지)
                if idx + 1 < len(df):
                    # 이전 정상 가격 (이상치 바로 전)
                    normal_price = df.loc[max(0, idx - 1), "close"]
                    for j in range(idx + 1, min(idx + 100, len(df))):
                        ratio = df.loc[j, "close"] / normal_price
                        if 0.1 < ratio < 10:
                            break  # 정상 복귀
                        to_remove.add(j)

            df = df.drop(index=list(to_remove)).reset_index(drop=True)
            logger.warning(
                f"[{symbol}] 가격 이상치 {len(to_remove)}행 제거 "
                f"(원본 {original_len}행 → {len(df)}행). "
                f"다른 종목 데이터 혼입 가능성."
            )

        return df

    def upload_csv(
        self,
        csv_path: Path,
        symbol: str,
        timeframe: str,
        replace_existing: bool = True,
    ) -> int:
        """
        Upload CSV data to database. (기존 코드 기반 + volume NULL 처리)

        Args:
            csv_path: Path to CSV file
            symbol: Stock symbol
            timeframe: Time period
            replace_existing: If True, replace existing data

        Returns:
            Number of rows inserted
        """
        table_name = self.get_table_name(symbol, timeframe)

        # Parse CSV
        df = self.parse_tradingview_csv(csv_path)
        if df.empty:
            logger.warning(f"No data in CSV: {csv_path}")
            return 0

        logger.info(f"Parsed {len(df)} rows from {csv_path.name}")

        # === 데이터 품질 검증 ===

        # 1) _D 테이블 삽입 시 실제 타임프레임 검증
        target_tf = self.get_table_name(symbol, timeframe).split("_")[-1]
        if target_tf == "D":
            detected_tf = self._detect_csv_timeframe(df)
            if detected_tf != "D" and detected_tf != "unknown":
                logger.warning(
                    f"[{symbol}] 타임프레임 불일치: 대상={target_tf}, "
                    f"감지={detected_tf}. intraday 데이터를 일봉으로 변환합니다."
                )
            # intraday 섞임 방지: 하루 1행만 유지
            df = self._validate_csv_for_daily(df, symbol)

        # 2) 가격 이상치 필터링 (다른 종목 데이터 혼입 감지)
        df = self._validate_price_sanity(df, symbol)

        if df.empty:
            logger.warning(f"[{symbol}] 검증 후 데이터 없음. 업로드 스킵.")
            return 0

        # Create table if needed
        self.create_table_if_not_exists(table_name)

        # Upload data
        with self.engine.connect() as conn:
            if replace_existing:
                min_time = df["time"].min()
                max_time = df["time"].max()

                delete_sql = text(f"""
                    DELETE FROM `{table_name}`
                    WHERE `time` >= :min_time AND `time` <= :max_time
                """)
                result = conn.execute(
                    delete_sql, {"min_time": min_time, "max_time": max_time}
                )
                deleted = result.rowcount
                if deleted > 0:
                    logger.info(f"Deleted {deleted} existing rows in time range")

            # Convert DataFrame to records
            records = df.replace({np.nan: None}).to_dict("records")

            for record in records:
                record["symbol"] = symbol
                record["timeframe"] = timeframe
                # volume 컬럼이 NULL을 허용하지 않는 기존 테이블 호환
                if record["volume"] is None:
                    record["volume"] = 0

            insert_sql = text(f"""
                INSERT INTO `{table_name}` (`time`, `symbol`, `timeframe`, `open`, `high`, `low`, `close`, `volume`, `rsi`, `macd`)
                VALUES (:time, :symbol, :timeframe, :open, :high, :low, :close, :volume, :rsi, :macd)
                ON DUPLICATE KEY UPDATE
                    `open` = VALUES(`open`),
                    `high` = VALUES(`high`),
                    `low` = VALUES(`low`),
                    `close` = VALUES(`close`),
                    `volume` = VALUES(`volume`),
                    `rsi` = VALUES(`rsi`),
                    `macd` = VALUES(`macd`)
            """)

            for record in records:
                conn.execute(insert_sql, record)
            conn.commit()

        logger.info(f"Uploaded {len(records)} rows to {table_name}")
        return len(records)

    # --- Corporate Actions ---

    def create_corporate_actions_tables(self):
        """
        Create corporate_dividends and corporate_splits tables if they don't exist.
        """
        try:
            with self.engine.connect() as conn:
                # Create corporate_dividends table
                dividends_sql = """
                CREATE TABLE IF NOT EXISTS `corporate_dividends` (
                    `symbol` VARCHAR(32) NOT NULL,
                    `ex_date` DATE NOT NULL,
                    `amount` DECIMAL(12, 6) NOT NULL,
                    `declaration_date` DATE,
                    `record_date` DATE,
                    `payment_date` DATE,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`symbol`, `ex_date`),
                    INDEX `idx_ex_date` (`ex_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
                conn.execute(text(dividends_sql))
                logger.info("Ensured corporate_dividends table exists")

                # Create corporate_splits table
                splits_sql = """
                CREATE TABLE IF NOT EXISTS `corporate_splits` (
                    `symbol` VARCHAR(32) NOT NULL,
                    `ex_date` DATE NOT NULL,
                    `split_ratio` DECIMAL(10, 6) NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (`symbol`, `ex_date`),
                    INDEX `idx_ex_date` (`ex_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
                conn.execute(text(splits_sql))
                conn.commit()
                logger.info("Ensured corporate_splits table exists")

        except Exception as e:
            logger.error(f"Failed to create corporate actions tables: {e}")
            raise

    def upload_dividends(self, df: pd.DataFrame, symbol: str) -> int:
        """
        Upload dividend data to corporate_dividends table.

        Args:
            df: DataFrame with dividend data (ex_date, amount required)
            symbol: Stock symbol

        Returns:
            Number of rows inserted/updated
        """
        if df.empty:
            logger.warning(f"No dividend data to upload for {symbol}")
            return 0

        self.create_corporate_actions_tables()

        df = df.copy()
        df.columns = df.columns.str.lower().str.strip()

        required_cols = ["ex_date", "amount"]
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column in dividends DataFrame: {col}")

        for col in ["ex_date", "declaration_date", "record_date", "payment_date"]:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce").dt.date

        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = df.dropna(subset=required_cols)

        if df.empty:
            logger.warning(f"No valid dividend data after cleaning for {symbol}")
            return 0

        records = df.replace({np.nan: None}).to_dict("records")
        for record in records:
            record["symbol"] = symbol

        insert_sql = text("""
            INSERT INTO `corporate_dividends`
            (`symbol`, `ex_date`, `amount`, `declaration_date`, `record_date`, `payment_date`)
            VALUES (:symbol, :ex_date, :amount, :declaration_date, :record_date, :payment_date)
            ON DUPLICATE KEY UPDATE
                `amount` = VALUES(`amount`),
                `declaration_date` = VALUES(`declaration_date`),
                `record_date` = VALUES(`record_date`),
                `payment_date` = VALUES(`payment_date`)
        """)

        try:
            with self.engine.connect() as conn:
                for record in records:
                    conn.execute(insert_sql, record)
                conn.commit()
            logger.info(f"Uploaded {len(records)} dividend records for {symbol}")
            return len(records)
        except Exception as e:
            logger.error(f"Failed to upload dividends for {symbol}: {e}")
            raise

    def upload_splits(self, df: pd.DataFrame, symbol: str) -> int:
        """
        Upload split data to corporate_splits table.

        Args:
            df: DataFrame with split data (ex_date, split_ratio required)
            symbol: Stock symbol

        Returns:
            Number of rows inserted/updated
        """
        if df.empty:
            logger.warning(f"No split data to upload for {symbol}")
            return 0

        self.create_corporate_actions_tables()

        df = df.copy()
        df.columns = df.columns.str.lower().str.strip()

        required_cols = ["ex_date", "split_ratio"]
        for col in required_cols:
            if col not in df.columns:
                raise ValueError(f"Missing required column in splits DataFrame: {col}")

        df["ex_date"] = pd.to_datetime(df["ex_date"], errors="coerce").dt.date
        df["split_ratio"] = pd.to_numeric(df["split_ratio"], errors="coerce")
        df = df.dropna(subset=required_cols)

        if df.empty:
            logger.warning(f"No valid split data after cleaning for {symbol}")
            return 0

        records = df.replace({np.nan: None}).to_dict("records")
        for record in records:
            record["symbol"] = symbol

        insert_sql = text("""
            INSERT INTO `corporate_splits`
            (`symbol`, `ex_date`, `split_ratio`)
            VALUES (:symbol, :ex_date, :split_ratio)
            ON DUPLICATE KEY UPDATE
                `split_ratio` = VALUES(`split_ratio`)
        """)

        try:
            with self.engine.connect() as conn:
                for record in records:
                    conn.execute(insert_sql, record)
                conn.commit()
            logger.info(f"Uploaded {len(records)} split records for {symbol}")
            return len(records)
        except Exception as e:
            logger.error(f"Failed to upload splits for {symbol}: {e}")
            raise

    def upload_corporate_actions(
        self, dividends_df: pd.DataFrame, splits_df: pd.DataFrame, symbol: str
    ) -> dict:
        """
        Upload both dividend and split data for a symbol.

        Args:
            dividends_df: DataFrame with dividend data (can be empty)
            splits_df: DataFrame with split data (can be empty)
            symbol: Stock symbol

        Returns:
            Dict with counts: {'dividends': int, 'splits': int}
        """
        results = {"dividends": 0, "splits": 0}

        self.create_corporate_actions_tables()

        if dividends_df is not None and not dividends_df.empty:
            try:
                results["dividends"] = self.upload_dividends(dividends_df, symbol)
            except Exception as e:
                logger.error(f"Failed to upload dividends for {symbol}: {e}")
                results["dividends"] = -1

        if splits_df is not None and not splits_df.empty:
            try:
                results["splits"] = self.upload_splits(splits_df, symbol)
            except Exception as e:
                logger.error(f"Failed to upload splits for {symbol}: {e}")
                results["splits"] = -1

        logger.info(f"Corporate actions upload complete for {symbol}: {results}")
        return results
