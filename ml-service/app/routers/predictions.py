from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database import get_processed_db, get_local_db
from app.services.prediction_service import PredictionService
from app.services.dummy_data_service import (
    generate_candlestick_forecast,
    generate_prediction_history,
    get_stock_info
)
from app.schemas import (
    PredictionResponse,
    PredictionListResponse,
    BatchPredictionRequest,
    BatchPredictionResponse,
    PredictionHistoryResponse,
    PredictionWithPerformance,
    CandlestickForecastResponse,
    CandlestickData,
    ForecastPriceResponse,
    RankingResponse,
    RankingItem,
    ModelInfoResponse,
    ModelListResponse,
    ModelLoadRequest,
    ModelLoadResponse,
)

router = APIRouter()


def get_prediction_service(
    processed_db: Session = Depends(get_processed_db),
    local_db: Session = Depends(get_local_db)
) -> PredictionService:
    return PredictionService(processed_db, local_db)


# NOTE: /ranking, /batch를 /{symbol}보다 먼저 선언해야 경로 충돌 방지
@router.post("/ranking", response_model=RankingResponse)
def predict_ranking(
    timeframe: str = Query("D", description="시간프레임"),
    service: PredictionService = Depends(get_prediction_service)
):
    """
    전체 종목 순위 예측 (주요 엔드포인트)

    AhnLab LightGBM LambdaRank 모델로 전체 종목의 상대 순위를 예측합니다.
    모든 종목의 rank, score, 매매 방향(BUY/SELL/HOLD)과 비율(weight)을 반환합니다.

    - **timeframe**: 시간프레임 (기본: D=일봉)
    """
    try:
        result = service.predict_ranking(timeframe)

        return RankingResponse(
            prediction_date=result["prediction_date"],
            timeframe=result["timeframe"],
            total_symbols=result["total_symbols"],
            model_name=result["model_name"],
            model_version=result.get("model_version"),
            rankings=[RankingItem(**r) for r in result["rankings"]],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ranking prediction failed: {str(e)}")


@router.post("/batch", response_model=BatchPredictionResponse)
def predict_batch(
    request: BatchPredictionRequest,
    service: PredictionService = Depends(get_prediction_service)
):
    """
    여러 종목 일괄 예측 (ranking으로 위임)

    - **symbols**: 예측할 종목 목록 (None이면 전체)
    - **limit**: 최대 종목 수 (기본 10)
    """
    try:
        predictions = service.batch_predict(request.symbols, request.limit)

        return BatchPredictionResponse(
            total=len(predictions),
            success=len(predictions),
            failed=0,
            predictions=[PredictionResponse.model_validate(p) for p in predictions]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {str(e)}")


@router.post("/{symbol}", response_model=PredictionResponse)
def predict_single(
    symbol: str,
    timeframe: str = Query("D", description="시간프레임"),
    service: PredictionService = Depends(get_prediction_service)
):
    """
    단일 종목 예측 수행

    - **symbol**: 종목 코드 (예: AAPL, NVDA)
    - **timeframe**: 시간프레임 (기본: D=일봉)
    """
    try:
        prediction = service.predict(symbol.upper(), timeframe)
        return PredictionResponse.model_validate(prediction)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.get("", response_model=PredictionListResponse)
def list_predictions(
    symbol: Optional[str] = Query(None, description="종목 필터"),
    limit: int = Query(50, ge=1, le=200, description="조회 수"),
    offset: int = Query(0, ge=0, description="오프셋"),
    service: PredictionService = Depends(get_prediction_service)
):
    """
    저장된 예측 결과 조회

    - **symbol**: 종목 필터 (옵션)
    - **limit**: 조회 수 (기본 50, 최대 200)
    - **offset**: 페이지네이션 오프셋
    """
    predictions = service.get_predictions(symbol, limit, offset)

    return PredictionListResponse(
        count=len(predictions),
        predictions=[PredictionResponse.model_validate(p) for p in predictions]
    )


@router.get("/ranking/latest", response_model=RankingResponse)
def get_latest_ranking(
    service: PredictionService = Depends(get_prediction_service)
):
    """최신 랭킹 결과 조회 (저장된 결과)"""
    predictions = service.get_latest_ranking()

    if not predictions:
        raise HTTPException(status_code=404, detail="No ranking results found")

    metadata = service.get_current_model_info()
    rankings = []
    for p in predictions:
        weight = 0.0
        n = len(predictions)
        if n > 1 and p.rank:
            weight = 1.0 - 2.0 * (p.rank - 1) / (n - 1)

        rankings.append(RankingItem(
            symbol=p.symbol,
            rank=p.rank or 0,
            score=p.score or 0.0,
            direction=p.predicted_direction,
            weight=round(weight, 4),
            current_close=p.current_close,
        ))

    return RankingResponse(
        prediction_date=predictions[0].prediction_date,
        timeframe="D",
        total_symbols=len(rankings),
        model_name=predictions[0].model_name or "ahnlab_lgbm",
        model_version=metadata.version if metadata else None,
        rankings=rankings,
    )


# NOTE: /history와 /forecast를 /{prediction_id}보다 먼저 선언해야 경로 충돌 방지
@router.get("/history", response_model=PredictionHistoryResponse)
def get_prediction_history(
    symbol: Optional[str] = Query(None, description="종목 필터"),
    days: int = Query(90, ge=1, le=365, description="조회 기간 (일)"),
    service: PredictionService = Depends(get_prediction_service)
):
    """
    예측 히스토리 조회 (더미 데이터)

    - **symbol**: 종목 필터 (옵션, 없으면 전체)
    - **days**: 조회 기간 (기본 90일, 최대 365일)
    """
    history = generate_prediction_history(
        symbol=symbol.upper() if symbol else None,
        days=days,
        seed=42
    )

    predictions = [
        PredictionWithPerformance(
            id=p["id"],
            symbol=p["symbol"],
            prediction_date=datetime.fromisoformat(p["prediction_date"]),
            target_date=datetime.fromisoformat(p["target_date"]),
            current_close=p["current_close"],
            predicted_close=p["predicted_close"],
            predicted_direction=p["predicted_direction"],
            confidence=p["confidence"],
            rsi_value=p["rsi_value"],
            macd_value=p["macd_value"],
            actual_close=p["actual_close"],
            actual_return=p["actual_return"],
            is_correct=p["is_correct"],
            days_elapsed=p["days_elapsed"],
            has_performance=p["has_performance"]
        )
        for p in history
    ]

    return PredictionHistoryResponse(
        count=len(predictions),
        predictions=predictions
    )


@router.get("/forecast/{symbol}/price", response_model=ForecastPriceResponse)
def get_price_forecast(
    symbol: str,
    service: PredictionService = Depends(get_prediction_service),
):
    """
    63일 가격 예측 (XGBoost 회귀 모델)

    회귀 모델이 로드되어 있으면 실제 예측 결과를 반환합니다.
    모델이 없으면 404를 반환합니다.
    """
    try:
        result = service.predict_forecast(symbol.upper())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Price regressor model not available. Run scripts/train_regressor.py first."
        )

    return ForecastPriceResponse(
        symbol=result["symbol"],
        current_close=result["current_close"],
        predicted_return=result["predicted_return"],
        predicted_close=result["predicted_close"],
        forecast_days=result["forecast_days"],
        model_name=result["model_name"],
        model_version=result["model_version"],
        generated_at=datetime.utcnow(),
    )


@router.get("/forecast/{symbol}", response_model=CandlestickForecastResponse)
def get_candlestick_forecast(
    symbol: str,
    days: int = Query(90, ge=30, le=365, description="예측 일 수"),
    current_price: Optional[float] = Query(None, description="현재가 (옵션)"),
    service: PredictionService = Depends(get_prediction_service),
):
    """
    향후 N일간 캔들스틱 예측 데이터

    회귀 모델이 있으면 실제 predicted_return을 기반으로 생성합니다.
    모델이 없으면 더미 데이터를 반환합니다.
    """
    symbol_upper = symbol.upper()

    # Try real model prediction for drift
    predicted_return = None
    try:
        forecast = service.predict_forecast(symbol_upper)
        if forecast:
            predicted_return = forecast["predicted_return"]
            if current_price is None:
                current_price = forecast["current_close"]
    except Exception:
        pass

    if current_price is None:
        stock_info = get_stock_info(symbol_upper)
        current_price = stock_info["current_price"]

    candles_data = generate_candlestick_forecast(
        symbol=symbol_upper,
        current_price=current_price,
        days=days,
    )

    candles = [CandlestickData(**c) for c in candles_data]

    return CandlestickForecastResponse(
        symbol=symbol_upper,
        current_price=current_price,
        forecast_days=days,
        data=candles,
        generated_at=datetime.utcnow(),
    )


@router.get("/latest/{symbol}", response_model=PredictionResponse)
def get_latest_prediction(
    symbol: str,
    service: PredictionService = Depends(get_prediction_service)
):
    """특정 종목의 최신 예측 조회"""
    prediction = service.get_latest_prediction(symbol.upper())

    if not prediction:
        raise HTTPException(status_code=404, detail=f"No prediction found for {symbol}")

    return PredictionResponse.model_validate(prediction)


@router.get("/{prediction_id}", response_model=PredictionResponse)
def get_prediction(
    prediction_id: int,
    service: PredictionService = Depends(get_prediction_service)
):
    """예측 결과 상세 조회"""
    prediction = service.get_prediction_by_id(prediction_id)

    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    return PredictionResponse.model_validate(prediction)


# Model Management Endpoints
@router.get("/models", response_model=ModelListResponse)
def list_models(
    service: PredictionService = Depends(get_prediction_service)
):
    """사용 가능한 모델 목록 조회"""
    models = service.get_available_models()

    model_responses = [
        ModelInfoResponse(
            name=m.name,
            model_type=m.model_type,
            description=m.description,
            version=m.version,
            trained_at=m.trained_at,
            training_years=m.training_years,
            feature_count=m.feature_count,
            file_path=m.file_path,
        )
        for m in models
    ]

    return ModelListResponse(count=len(model_responses), models=model_responses)


@router.post("/models/{model_name}/load", response_model=ModelLoadResponse)
def load_model(
    model_name: str,
    service: PredictionService = Depends(get_prediction_service)
):
    """특정 모델 로딩"""
    try:
        metadata = service.load_model(model_name)

        return ModelLoadResponse(
            success=True,
            message=f"Model {model_name} loaded successfully",
            model=ModelInfoResponse(
                name=metadata.name,
                model_type=metadata.model_type,
                description=metadata.description,
                version=metadata.version,
                trained_at=metadata.trained_at,
                training_years=metadata.training_years,
                feature_count=metadata.feature_count,
                file_path=metadata.file_path,
            )
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.get("/models/current", response_model=ModelInfoResponse)
def get_current_model(
    service: PredictionService = Depends(get_prediction_service)
):
    """현재 로딩된 모델 정보 조회"""
    metadata = service.get_current_model_info()

    if metadata is None:
        raise HTTPException(status_code=404, detail="No model currently loaded")

    return ModelInfoResponse(
        name=metadata.name,
        model_type=metadata.model_type,
        description=metadata.description,
        version=metadata.version,
        trained_at=metadata.trained_at,
        training_years=metadata.training_years,
        feature_count=metadata.feature_count,
        file_path=metadata.file_path,
    )
