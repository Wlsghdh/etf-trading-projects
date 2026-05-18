"""
MySQL Data Provider for TradingView scraped data.

Fetches OHLCV data from the etf2_db MySQL database containing
TradingView scraped stock data.

Table format: {symbol}_{timeframe} (e.g., AAPL_D, NVDA_1h)
Columns: time, symbol, timeframe, open, high, low, close, volume, rsi, macd

NOTE: TradingView data stores raw (unadjusted) prices. Stock splits
(e.g., AAPL 4:1 in 2020) appear as sudden -75% drops. This provider
adjusts prices at read time using split history from yfinance.
"""
import os
import logging
import pandas as pd
from typing import List, Optional
from dotenv import load_dotenv

from .base import BaseDataProvider

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()


class MySQLProvider(BaseDataProvider):
    """
    Data provider for MySQL database with TradingView scraped data.

    Usage:
        provider = MySQLProvider()
        df = provider.fetch_stock_data("AAPL", "2020-01-01", "2024-12-31")
        panel = provider.fetch_batch(["AAPL", "MSFT"], "2020-01-01", "2024-12-31")
    """

    def __init__(
        self,
        db_url: Optional[str] = None,
        timeframe: str = "D",
        adjust_splits: bool = True,
    ):
        """
        Initialize MySQL provider.

        Args:
            db_url: SQLAlchemy database URL. If None, reads from environment:
                    - MYSQL_URL (full URL) or
                    - MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
            timeframe: Timeframe suffix for table names (default "D" for daily)
            adjust_splits: If True, apply stock split adjustments to OHLCV prices
                           using split history from yfinance. (default True)
        """
        self.db_url = db_url or self._get_db_url_from_env()
        self.timeframe = timeframe
        self.adjust_splits = adjust_splits
        self._engine = None
        self._split_cache: dict = {}  # symbol -> splits DataFrame

    def _get_db_url_from_env(self) -> str:
        """Build database URL from environment variables."""
        # Try full URL first
        if os.getenv("MYSQL_URL"):
            return os.getenv("MYSQL_URL")

        # Build from components
        host = os.getenv("MYSQL_HOST", "localhost")
        port = os.getenv("MYSQL_PORT", "3306")
        user = os.getenv("MYSQL_USER", "ahnbi2")
        password = os.getenv("MYSQL_PASSWORD", "bigdata")
        db = os.getenv("MYSQL_DB", "etf2_db")

        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{db}"

    @property
    def engine(self):
        """Lazy-load SQLAlchemy engine."""
        if self._engine is None:
            try:
                from sqlalchemy import create_engine
                self._engine = create_engine(self.db_url, pool_pre_ping=True)
            except ImportError:
                raise ImportError(
                    "SQLAlchemy and pymysql required. "
                    "Install with: pip install sqlalchemy pymysql"
                )
        return self._engine

    def _get_table_name(self, symbol: str) -> str:
        """Get table name for a symbol."""
        return f"{symbol}_{self.timeframe}"

    def _get_splits(self, ticker: str) -> pd.DataFrame:
        """
        Fetch stock split history from yfinance (cached per symbol).

        Returns:
            DataFrame with DatetimeIndex and 'Stock Splits' column,
            or empty DataFrame if unavailable.
        """
        if ticker in self._split_cache:
            return self._split_cache[ticker]

        try:
            import yfinance as yf
            stock = yf.Ticker(ticker)
            splits = stock.splits  # Series with DatetimeIndex

            if splits is not None and not splits.empty:
                # Ensure timezone-naive for comparison with DB dates
                if splits.index.tz is not None:
                    splits.index = splits.index.tz_localize(None)
                self._split_cache[ticker] = splits
                logger.info(
                    f"  [MySQL] Loaded {len(splits)} splits for {ticker}: "
                    f"{dict(zip(splits.index.strftime('%Y-%m-%d'), splits.values))}"
                )
                return splits
        except Exception as e:
            logger.warning(f"  [MySQL] Could not fetch splits for {ticker}: {e}")

        self._split_cache[ticker] = pd.Series(dtype=float)
        return self._split_cache[ticker]

    def _apply_split_adjustment(
        self, df: pd.DataFrame, ticker: str
    ) -> pd.DataFrame:
        """
        Adjust OHLCV prices for stock splits.

        For each split event, all prices BEFORE the split date are divided
        by the cumulative split factor. This converts raw prices to
        split-adjusted prices (equivalent to yfinance auto_adjust for splits).

        Example: AAPL 4:1 split on 2020-08-31
            - Pre-split close $500 -> adjusted $125
            - Post-split close $125 -> stays $125

        Also populates the 'stock_splits' column with actual split ratios.
        """
        splits = self._get_splits(ticker)
        if splits.empty:
            return df

        price_cols = ['open', 'high', 'low', 'close']

        # Build cumulative adjustment factor from newest split to oldest
        # For each date, the factor is the product of all splits AFTER that date
        # We divide pre-split prices by split ratio to get adjusted prices
        df = df.copy()
        df['_adj_factor'] = 1.0

        for split_date, ratio in splits.items():
            if ratio <= 0:
                continue
            split_date = pd.Timestamp(split_date)
            # All rows before the split date need adjustment
            mask = df['date'] < split_date
            df.loc[mask, '_adj_factor'] *= ratio

        # Apply adjustment: divide raw prices by cumulative factor
        for col in price_cols:
            df[col] = df[col] / df['_adj_factor']

        # Adjust volume inversely (more shares after split)
        df['volume'] = df['volume'] * df['_adj_factor']

        # Populate stock_splits column with actual split data
        df['stock_splits'] = 0.0
        for split_date, ratio in splits.items():
            split_date = pd.Timestamp(split_date)
            mask = df['date'] == split_date
            if mask.any():
                df.loc[mask, 'stock_splits'] = ratio

        adjusted_count = (df['_adj_factor'] != 1.0).sum()
        if adjusted_count > 0:
            logger.info(
                f"  [MySQL] Split-adjusted {adjusted_count}/{len(df)} rows for {ticker}"
            )

        df = df.drop(columns=['_adj_factor'])
        return df

    def fetch_stock_data(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
    ) -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV data for a single ticker from MySQL.

        If adjust_splits=True (default), prices are split-adjusted at read time
        using split history from yfinance. This prevents the ML model from seeing
        fake price drops caused by stock splits.

        Args:
            ticker: Stock symbol (e.g., "AAPL")
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            DataFrame with columns: [ticker, date, open, high, low, close, volume,
                                      dividends, stock_splits]
            Returns None if table doesn't exist or query fails
        """
        table_name = self._get_table_name(ticker)

        query = f"""
        SELECT
            time as date,
            open,
            high,
            low,
            close,
            volume
        FROM `{table_name}`
        WHERE time >= '{start_date}' AND time <= '{end_date}'
        ORDER BY time
        """

        try:
            df = pd.read_sql(query, self.engine)

            if df.empty:
                print(f"  [MySQL] No data for {ticker}")
                return None

            # Add ticker column
            df['ticker'] = ticker

            # Ensure date is datetime
            df['date'] = pd.to_datetime(df['date'])

            # Reorder columns
            df = df[['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']]

            # Add placeholder columns before adjustment
            df['dividends'] = 0.0
            df['stock_splits'] = 0.0

            # Apply stock split adjustments if enabled
            if self.adjust_splits:
                df = self._apply_split_adjustment(df, ticker)

            return df

        except Exception as e:
            # Table might not exist
            if "doesn't exist" in str(e).lower() or "1146" in str(e):
                print(f"  [MySQL] Table not found: {table_name}")
            else:
                print(f"  [MySQL] Error fetching {ticker}: {e}")
            return None

    def fetch_batch(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data for multiple tickers.

        Args:
            tickers: List of stock symbols
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            Combined DataFrame with all tickers
        """
        all_data = []
        success_count = 0
        fail_count = 0

        print(f"[MySQL] Fetching {len(tickers)} tickers from {start_date} to {end_date}")

        for i, ticker in enumerate(tickers):
            if (i + 1) % 50 == 0:
                print(f"  Progress: {i + 1}/{len(tickers)}")

            df = self.fetch_stock_data(ticker, start_date, end_date)

            if df is not None and not df.empty:
                all_data.append(df)
                success_count += 1
            else:
                fail_count += 1

        print(f"[MySQL] Completed: {success_count} success, {fail_count} failed")

        if not all_data:
            return pd.DataFrame()

        return pd.concat(all_data, ignore_index=True)

    def get_available_symbols(self) -> List[str]:
        """
        Get list of available symbols in the database.

        Returns:
            List of symbol names (without timeframe suffix)
        """
        from sqlalchemy import text

        query = text("""
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = 'etf2_db'
          AND TABLE_NAME LIKE :pattern
        """)

        try:
            with self.engine.connect() as conn:
                result = conn.execute(query, {"pattern": "%_D"})
                tables = [row[0] for row in result]
            # Remove _D suffix to get symbol names
            symbols = [name.replace('_D', '') for name in tables]
            return sorted(symbols)
        except Exception as e:
            print(f"[MySQL] Error getting symbols: {e}")
            return []

    def check_connection(self) -> bool:
        """Test database connection."""
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            print(f"[MySQL] Connection failed: {e}")
            return False

    def supports_dividends(self) -> bool:
        """MySQL provider does not include dividend data."""
        return False
