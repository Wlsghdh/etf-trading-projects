from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


# Health
class HealthResponse(BaseModel):
    status: str
    trading_mode: str
    db: str
    timestamp: datetime


# Trading Cycle
class CycleStatus(BaseModel):
    id: int
    cycle_start_date: date
    current_day_number: int
    initial_capital: float
    strategy_capital: float
    fixed_capital: float
    trading_mode: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Daily Purchase
class PurchaseItem(BaseModel):
    id: int
    cycle_id: int
    trading_day_number: int
    purchase_date: date
    etf_code: str
    quantity: float
    price: float
    total_amount: float
    sold: bool
    sold_date: Optional[date] = None
    sold_price: Optional[float] = None
    sell_pnl: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Order Log
class OrderLogItem(BaseModel):
    id: int
    cycle_id: Optional[int] = None
    order_type: str
    etf_code: str
    quantity: float
    price: Optional[float] = None
    order_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# API Responses
class TradingStatusResponse(BaseModel):
    cycle: Optional[CycleStatus] = None
    trading_mode: str
    is_trading_day: bool
    next_trading_day: Optional[date] = None
    total_holdings: int = 0
    total_invested: float = 0.0
    automation_enabled: bool = False
    fractional_mode: bool = False


class PortfolioResponse(BaseModel):
    cycle_id: Optional[int] = None
    holdings: list[PurchaseItem] = []
    total_invested: float = 0.0
    total_count: int = 0


class TradeExecutionResponse(BaseModel):
    success: bool
    message: str
    day_number: int = 0
    sold_count: int = 0
    bought_count: int = 0
    sold_total: float = 0.0
    bought_total: float = 0.0


class HistoryResponse(BaseModel):
    total: int
    page: int
    page_size: int
    purchases: list[PurchaseItem] = []


class OrderLogResponse(BaseModel):
    total: int
    page: int
    page_size: int
    orders: list[OrderLogItem] = []


class NewCycleRequest(BaseModel):
    initial_capital: float


class NewCycleResponse(BaseModel):
    success: bool
    message: str
    cycle: Optional[CycleStatus] = None


# 잔고 조회
class HoldingItem(BaseModel):
    code: str
    name: str
    quantity: float
    avg_price: float
    current_price: float
    pnl_rate: float
    exchange_code: str


class BalanceResponse(BaseModel):
    available_cash_usd: float
    total_evaluation_usd: float
    available_cash_krw: float
    total_evaluation_krw: float
    exchange_rate: float  # USD/KRW
    holdings: list[HoldingItem] = []
    kis_connected: bool
    error: Optional[str] = None


# 사이클 리셋
class ResetResponse(BaseModel):
    success: bool
    message: str
    cycle: Optional[CycleStatus] = None


# ML Service 연동 (RankingItem 호환)
class RankingItem(BaseModel):
    symbol: str
    rank: int
    score: float
    direction: str
    weight: float
    current_close: Optional[float] = None


class RankingResponse(BaseModel):
    prediction_date: datetime
    timeframe: str
    total_symbols: int
    model_name: str
    model_version: Optional[str] = None
    rankings: list[RankingItem]
