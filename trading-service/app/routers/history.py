from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyPurchase, OrderLog, TradingCycle, TradingLog
from app.schemas import (
    HistoryResponse,
    OrderLogResponse,
    PurchaseItem,
    OrderLogItem,
)

router = APIRouter(prefix="/api/trading")


@router.get("/history", response_model=HistoryResponse)
def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cycle_id: int = Query(None),
    db: Session = Depends(get_db),
):
    """거래 내역 조회 (페이지네이션)"""
    query = db.query(DailyPurchase)
    if cycle_id:
        query = query.filter(DailyPurchase.cycle_id == cycle_id)
    else:
        # 활성 사이클 기본
        active_cycle = (
            db.query(TradingCycle)
            .filter(TradingCycle.is_active == True)
            .order_by(TradingCycle.id.desc())
            .first()
        )
        if active_cycle:
            query = query.filter(DailyPurchase.cycle_id == active_cycle.id)

    total = query.count()
    purchases = (
        query.order_by(DailyPurchase.trading_day_number.desc(), DailyPurchase.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return HistoryResponse(
        total=total,
        page=page,
        page_size=page_size,
        purchases=[PurchaseItem.model_validate(p) for p in purchases],
    )


@router.get("/orders", response_model=OrderLogResponse)
def get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cycle_id: int = Query(None),
    status: str = Query(None),
    db: Session = Depends(get_db),
):
    """주문 로그 조회"""
    query = db.query(OrderLog)
    if cycle_id:
        query = query.filter(OrderLog.cycle_id == cycle_id)
    if status:
        query = query.filter(OrderLog.status == status)

    total = query.count()
    orders = (
        query.order_by(OrderLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return OrderLogResponse(
        total=total,
        page=page,
        page_size=page_size,
        orders=[OrderLogItem.model_validate(o) for o in orders],
    )


@router.get("/logs")
def get_trading_logs(
    limit: int = Query(200, ge=1, le=1000),
    level: str = Query(None),
    symbol: str = Query(None),
    db: Session = Depends(get_db),
):
    """트레이딩 서비스 로그 조회 (실시간 모니터링용)"""
    query = db.query(TradingLog)
    if level and level != "ALL":
        query = query.filter(TradingLog.level == level.upper())
    if symbol:
        query = query.filter(TradingLog.symbol == symbol.upper())

    total = query.count()
    logs = query.order_by(TradingLog.created_at.desc()).limit(limit).all()

    return {
        "logs": [
            {
                "id": log.id,
                "level": log.level,
                "message": log.message,
                "symbol": log.symbol,
                "order_type": log.order_type,
                "timestamp": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "count": total,
        "limit": limit,
    }
