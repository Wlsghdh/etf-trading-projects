"""
MySQL Data Provider for TradingView scraped data.

Fetches OHLCV data from the etf2_db MySQL database containing
TradingView scraped stock data. Dividends and stock splits are
supplemented from Yahoo Finance via yfinance.

Table format: {symbol}_{timeframe} (e.g., AAPL_D, NVDA_1h)
Columns: time, symbol, timeframe, open, high, low, close, volume, rsi, macd
"""
import os
import pandas as pd
from typing import List, Optional
from dotenv import load_dotenv

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    yf = None

from .base import BaseDataProvider

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
    ):
        """
        Initialize MySQL provider.

        Args:
            db_url: SQLAlchemy database URL. If None, reads from environment:
                    - MYSQL_URL (full URL) or
                    - MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
            timeframe: Timeframe suffix for table names (default "D" for daily)
        """
        self.db_url = db_url or self._get_db_url_from_env()
        self.timeframe = timeframe
        self._engine = None

    def _get_db_url_from_env(self) -> str:
        """Build database URL from environment variables."""
        # Try full URL first (DB_URL or MYSQL_URL)
        if os.getenv("DB_URL"):
            return os.getenv("DB_URL")
        if os.getenv("MYSQL_URL"):
            return os.getenv("MYSQL_URL")

        # Build from components
        host = os.getenv("MYSQL_HOST", "172.17.0.1")
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

    def fetch_stock_data(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
    ) -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV data for a single ticker from MySQL.

        Args:
            ticker: Stock symbol (e.g., "AAPL")
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            DataFrame with columns: [ticker, date, open, high, low, close, volume]
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

            # Fetch dividends and stock splits from yfinance
            df = self._merge_corporate_actions(df, ticker, start_date, end_date)

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

    def _merge_corporate_actions(
        self, df: pd.DataFrame, ticker: str, start_date: str, end_date: str
    ) -> pd.DataFrame:
        """
        Merge dividends and stock splits from yfinance into the OHLCV DataFrame.

        Args:
            df: DataFrame with OHLCV data (must have 'date' column)
            ticker: Stock symbol
            start_date: Start date
            end_date: End date

        Returns:
            DataFrame with dividends and stock_splits columns added
        """
        df['dividends'] = 0.0
        df['stock_splits'] = 0.0

        if not YFINANCE_AVAILABLE:
            print(f"  [MySQL] yfinance not available, skipping corporate actions for {ticker}")
            return df

        try:
            stock = yf.Ticker(ticker)

            # Fetch dividends
            divs = stock.dividends
            if not divs.empty:
                divs_df = divs.reset_index()
                divs_df.columns = ['date', 'dividends']
                divs_df['date'] = pd.to_datetime(divs_df['date']).dt.tz_localize(None)
                # Normalize to date only for merge
                divs_df['date'] = divs_df['date'].dt.normalize()
                df = df.merge(
                    divs_df, on='date', how='left', suffixes=('_old', '')
                )
                df['dividends'] = df['dividends'].fillna(df.get('dividends_old', 0.0)).fillna(0.0)
                df.drop(columns=['dividends_old'], errors='ignore', inplace=True)

            # Fetch stock splits
            splits = stock.splits
            if not splits.empty:
                splits_df = splits.reset_index()
                splits_df.columns = ['date', 'stock_splits']
                splits_df['date'] = pd.to_datetime(splits_df['date']).dt.tz_localize(None)
                splits_df['date'] = splits_df['date'].dt.normalize()
                df = df.merge(
                    splits_df, on='date', how='left', suffixes=('_old', '')
                )
                df['stock_splits'] = df['stock_splits'].fillna(df.get('stock_splits_old', 0.0)).fillna(0.0)
                df.drop(columns=['stock_splits_old'], errors='ignore', inplace=True)

        except Exception as e:
            print(f"  [MySQL] yfinance corporate actions failed for {ticker}: {e}")

        return df

    def supports_dividends(self) -> bool:
        """MySQL provider includes dividend data via yfinance."""
        return YFINANCE_AVAILABLE
