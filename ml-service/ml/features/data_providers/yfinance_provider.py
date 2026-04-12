"""YFinance data provider with dividends and splits support."""
import pandas as pd
import yfinance as yf
from typing import List, Optional
from .base import BaseDataProvider


class YFinanceProvider(BaseDataProvider):
    def __init__(self, include_dividends: bool = True):
        self.include_dividends = include_dividends

    def fetch_stock_data(self, ticker: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV + dividends + stock_splits for a single ticker.

        Uses auto_adjust=True so OHLCV prices are split-adjusted,
        preventing fake price drops from stock splits in the data.

        Returns DataFrame with columns: [open, high, low, close, volume, dividends, stock_splits]
        """
        try:
            stock = yf.Ticker(ticker)
            # auto_adjust=True returns split-adjusted prices
            df = stock.history(start=start_date, end=end_date, auto_adjust=True)
            if df.empty:
                return None
            # Rename columns to lowercase
            df.columns = df.columns.str.lower().str.replace(' ', '_')
            # Keep only needed columns
            cols = ['open', 'high', 'low', 'close', 'volume']
            if self.include_dividends:
                cols.extend(['dividends', 'stock_splits'])
            df = df[[c for c in cols if c in df.columns]]
            return df
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
            return None

    def fetch_batch(self, tickers: List[str], start_date: str, end_date: str) -> pd.DataFrame:
        """Fetch data for multiple tickers and return panel DataFrame."""
        panels = []
        for ticker in tickers:
            df = self.fetch_stock_data(ticker, start_date, end_date)
            if df is not None and not df.empty:
                df = df.reset_index()
                df['ticker'] = ticker
                df = df.rename(columns={'Date': 'date', 'index': 'date'})
                panels.append(df)
        if not panels:
            return pd.DataFrame()
        panel = pd.concat(panels, ignore_index=True)
        return panel

    def supports_dividends(self) -> bool:
        return self.include_dividends
