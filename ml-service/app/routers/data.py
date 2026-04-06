from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_remote_db
from app.services.data_service import DataService
from app.schemas import StockDataResponse, StockDataPoint, SymbolListResponse

router = APIRouter()


@router.get("/symbols", response_model=SymbolListResponse)
def list_symbols(db: Session = Depends(get_remote_db)):
    """사용 가능한 종목 목록 조회"""
    service = DataService(db)
    symbols = service.list_symbols()

    return SymbolListResponse(
        count=len(symbols),
        symbols=symbols
    )


@router.get("/{symbol}", response_model=StockDataResponse)
def get_stock_data(
    symbol: str,
    timeframe: str = Query("D", description="시간프레임: D(일봉), 1h(시간봉), 10m(10분봉)"),
    limit: int = Query(100, ge=1, le=1000, description="조회할 데이터 수"),
    db: Session = Depends(get_remote_db)
):
    """
    주가 데이터 조회

    - **symbol**: 종목 코드 (예: AAPL, NVDA, MSFT)
    - **timeframe**: 시간프레임 (D=일봉, 1h=시간봉, 10m=10분봉, W=주봉, M=월봉)
    - **limit**: 조회할 데이터 수 (기본 100, 최대 1000)
    """
    service = DataService(db)

    # 테이블 존재 확인
    if not service.check_table_exists(symbol, timeframe):
        raise HTTPException(
            status_code=404,
            detail=f"Data not found for {symbol} with timeframe {timeframe}"
        )

    df = service.get_stock_data(symbol, timeframe, limit)

    if df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data available for {symbol}"
        )

    import math

    def safe_float(val):
        """NaN/Inf를 None으로 변환"""
        if val is None:
            return None
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f

    # DataFrame을 Pydantic 모델로 변환
    data_points = [
        StockDataPoint(
            time=row["time"],
            open=float(row["open"]),
            high=float(row["high"]),
            low=float(row["low"]),
            close=float(row["close"]),
            volume=int(row["volume"]) if not math.isnan(float(row["volume"])) else 0,
            rsi=safe_float(row.get("rsi")),
            macd=safe_float(row.get("macd")),
        )
        for _, row in df.iterrows()
    ]

    return StockDataResponse(
        symbol=symbol,
        timeframe=timeframe,
        count=len(data_points),
        data=data_points
    )
