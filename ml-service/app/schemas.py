from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# Stock Data Schemas
class StockDataPoint(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    rsi: Optional[float] = None
    macd: Optional[float] = None


class StockDataResponse(BaseModel):
    symbol: str
    timeframe: str
    count: int
    data: list[StockDataPoint]


class SymbolListResponse(BaseModel):
    count: int
    symbols: list[str]


# Prediction Schemas
class PredictionCreate(BaseModel):
    symbol: str
    prediction_date: datetime
    target_date: datetime
    current_close: float
    predicted_close: float
    predicted_direction: str
    confidence: float
    rsi_value: Optional[float] = None
    macd_value: Optional[float] = None


class PredictionResponse(BaseModel):
    id: int
    symbol: str
    prediction_date: datetime
    target_date: datetime
    current_close: float
    predicted_close: float
    predicted_direction: str
    confidence: float
    rank: Optional[int] = None
    score: Optional[float] = None
    rsi_value: Optional[float] = None
    macd_value: Optional[float] = None
    actual_close: Optional[float] = None
    actual_return: Optional[float] = None
    is_correct: Optional[bool] = None

    class Config:
        from_attributes = True


class PredictionListResponse(BaseModel):
    count: int
    predictions: list[PredictionResponse]


class BatchPredictionRequest(BaseModel):
    symbols: Optional[list[str]] = None  # None이면 전체 종목
    limit: int = 10  # 최대 종목 수


class BatchPredictionResponse(BaseModel):
    total: int
    success: int
    failed: int
    predictions: list[PredictionResponse]


# Ranking Schemas
class RankingItem(BaseModel):
    """Single item in ranking response"""
    symbol: str
    rank: int
    score: float
    direction: str  # BUY, SELL, HOLD
    weight: float  # 매매 비율 (-1.0 ~ 1.0)
    current_close: Optional[float] = None


class RankingResponse(BaseModel):
    """Full ranking prediction response"""
    prediction_date: datetime
    timeframe: str
    total_symbols: int
    model_name: str
    model_version: Optional[str] = None
    rankings: list[RankingItem]


# Health Check
class HealthResponse(BaseModel):
    status: str
    remote_db: str
    local_db: str
    timestamp: datetime


# Factsheet Schemas
class ETFCompositionResponse(BaseModel):
    rank: int
    ticker: str
    weight: float
    stock_name: Optional[str] = None
    sector: Optional[str] = None

    class Config:
        from_attributes = True


class ETFMonthlySnapshotResponse(BaseModel):
    id: int
    year: int
    month: int
    snapshot_date: datetime
    nav: Optional[float] = None
    monthly_return: Optional[float] = None
    ytd_return: Optional[float] = None
    volatility: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    compositions: list[ETFCompositionResponse] = []

    class Config:
        from_attributes = True


class FactsheetListItem(BaseModel):
    id: int
    year: int
    month: int
    snapshot_date: datetime


class FactsheetListResponse(BaseModel):
    count: int
    factsheets: list[FactsheetListItem]


class FactsheetGenerateRequest(BaseModel):
    year: int
    month: int


class FactsheetGenerateResponse(BaseModel):
    success: bool
    message: str
    snapshot: Optional[ETFMonthlySnapshotResponse] = None


# Prediction History Schemas
class PredictionHistoryRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    symbol: Optional[str] = None


class PredictionWithPerformance(BaseModel):
    id: int
    symbol: str
    prediction_date: datetime
    target_date: datetime
    current_close: float
    predicted_close: float
    predicted_direction: str
    confidence: float
    rsi_value: Optional[float] = None
    macd_value: Optional[float] = None
    actual_close: Optional[float] = None
    actual_return: Optional[float] = None
    is_correct: Optional[bool] = None
    days_elapsed: int = 0
    has_performance: bool = False

    class Config:
        from_attributes = True


class PredictionHistoryResponse(BaseModel):
    count: int
    predictions: list[PredictionWithPerformance]
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


# Candlestick Forecast Schemas
class CandlestickData(BaseModel):
    time: str  # ISO format date string
    open: float
    high: float
    low: float
    close: float
    volume: int


class CandlestickForecastResponse(BaseModel):
    symbol: str
    current_price: float
    forecast_days: int
    data: list[CandlestickData]
    generated_at: datetime


class ForecastPriceResponse(BaseModel):
    """63-day price forecast from regression model"""
    symbol: str
    current_close: float
    predicted_return: float
    predicted_close: float
    forecast_days: int = 63
    model_name: str
    model_version: Optional[str] = None
    generated_at: datetime


# Model Management Schemas
class ModelInfoResponse(BaseModel):
    """Model information response"""
    name: str
    model_type: str
    description: str = ""
    version: str = "1.0.0"
    trained_at: Optional[str] = None
    training_years: list[int] = []
    feature_count: int = 0
    file_path: Optional[str] = None

    class Config:
        from_attributes = True


class ModelListResponse(BaseModel):
    """List of available models"""
    count: int
    models: list[ModelInfoResponse]


class ModelLoadRequest(BaseModel):
    """Request to load a specific model"""
    model_name: str
    force_reload: bool = False


class ModelLoadResponse(BaseModel):
    """Response after loading a model"""
    success: bool
    message: str
    model: Optional[ModelInfoResponse] = None
