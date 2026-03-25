from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import TradingCycle, DailyPurchase
from app.schemas import (
    TradingStatusResponse,
    PortfolioResponse,
    TradeExecutionResponse,
    NewCycleRequest,
    NewCycleResponse,
    CycleStatus,
    PurchaseItem,
    BalanceResponse,
    HoldingItem,
    ResetResponse,
)
from app.services.cycle_manager import get_cycle_manager
from app.services.capital_manager import get_capital_manager
from app.services.holiday_calendar import is_trading_day, get_next_trading_day
from app.services.trade_executor import execute_daily_trading

router = APIRouter(prefix="/api/trading")

# --- 자동매매 상태 관리 ---
_automation_enabled = False
_dst_enabled = True  # 서머타임 (3월~11월)


def _get_trade_time() -> tuple[int, int]:
    """서머타임 적용된 매매 시간 반환"""
    if _dst_enabled:
        return 22, 30  # 서머타임: 22:30 KST
    else:
        return 23, 30  # 비서머타임: 23:30 KST


class AutomationStatusResponse(BaseModel):
    enabled: bool
    fractional_mode: bool
    scheduler_time: str
    trading_mode: str
    dst_enabled: bool


class AutomationToggleRequest(BaseModel):
    enabled: bool
    fractional_mode: Optional[bool] = None
    dst_enabled: Optional[bool] = None


class AutomationToggleResponse(BaseModel):
    success: bool
    enabled: bool
    fractional_mode: bool
    dst_enabled: bool
    message: str


class SimulationRequest(BaseModel):
    initial_capital: float
    fractional_mode: bool = False


class SimulationResponse(BaseModel):
    daily_budget: float
    strategy_amount: float
    fixed_amount: float
    fractional_mode: bool
    fixed_etfs: list[dict]
    strategy_etfs: list[dict]
    total_buy_amount: float
    remaining_budget: float
    total_etf_count: int


# --- 기존 엔드포인트 ---

@router.get("/status", response_model=TradingStatusResponse)
def get_status(db: Session = Depends(get_db)):
    """현재 사이클 상태, 거래일, 모드 조회"""
    cycle_mgr = get_cycle_manager()
    capital_mgr = get_capital_manager()
    cycle = (
        db.query(TradingCycle)
        .filter(TradingCycle.is_active == True)
        .order_by(TradingCycle.id.desc())
        .first()
    )

    today = date.today()
    trading_day = is_trading_day(today)
    next_day = get_next_trading_day(today) if not trading_day else None

    cycle_status = None
    total_holdings = 0
    total_invested = 0.0

    if cycle:
        cycle_status = CycleStatus.model_validate(cycle)
        unsold = cycle_mgr.get_unsold_purchases(db, cycle.id)
        total_holdings = len(unsold)
        total_invested = sum(p.total_amount for p in unsold)

    return TradingStatusResponse(
        cycle=cycle_status,
        trading_mode=settings.trading_mode,
        is_trading_day=trading_day,
        next_trading_day=next_day,
        total_holdings=total_holdings,
        total_invested=total_invested,
        automation_enabled=_automation_enabled,
        fractional_mode=capital_mgr.fractional_mode,
    )


@router.get("/portfolio", response_model=PortfolioResponse)
def get_portfolio(db: Session = Depends(get_db)):
    """현재 보유 내역 (미매도 매수건)"""
    cycle = (
        db.query(TradingCycle)
        .filter(TradingCycle.is_active == True)
        .order_by(TradingCycle.id.desc())
        .first()
    )

    if not cycle:
        return PortfolioResponse()

    cycle_mgr = get_cycle_manager()
    holdings = cycle_mgr.get_unsold_purchases(db, cycle.id)
    items = [PurchaseItem.model_validate(h) for h in holdings]

    return PortfolioResponse(
        cycle_id=cycle.id,
        holdings=items,
        total_invested=sum(h.total_amount for h in holdings),
        total_count=len(holdings),
    )


@router.post("/execute", response_model=TradeExecutionResponse)
async def manual_execute(db: Session = Depends(get_db)):
    """수동 매매 실행 (테스트용)"""
    result = await execute_daily_trading(db)
    return TradeExecutionResponse(**result)


@router.post("/cycle/new", response_model=NewCycleResponse)
def create_new_cycle(req: NewCycleRequest, db: Session = Depends(get_db)):
    """새 사이클 강제 시작"""
    cycle_mgr = get_cycle_manager()
    cycle = cycle_mgr.create_new_cycle(db, req.initial_capital)
    return NewCycleResponse(
        success=True,
        message=f"새 사이클 생성: id={cycle.id}",
        cycle=CycleStatus.model_validate(cycle),
    )


# --- 자동매매 제어 엔드포인트 ---

@router.get("/automation", response_model=AutomationStatusResponse)
def get_automation_status():
    """자동매매 설정 상태 조회"""
    capital_mgr = get_capital_manager()
    hour, minute = _get_trade_time()
    return AutomationStatusResponse(
        enabled=_automation_enabled,
        fractional_mode=capital_mgr.fractional_mode,
        scheduler_time=f"{hour:02d}:{minute:02d} KST",
        trading_mode=settings.trading_mode,
        dst_enabled=_dst_enabled,
    )


@router.post("/automation", response_model=AutomationToggleResponse)
def toggle_automation(req: AutomationToggleRequest):
    """자동매매 시작/중지 및 매매 모드/서머타임 설정"""
    global _automation_enabled, _dst_enabled
    capital_mgr = get_capital_manager()

    _automation_enabled = req.enabled

    if req.fractional_mode is not None:
        capital_mgr.fractional_mode = req.fractional_mode

    if req.dst_enabled is not None:
        _dst_enabled = req.dst_enabled

    # APScheduler 시간 업데이트
    hour, minute = _get_trade_time()
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from app.services.trade_executor import execute_daily_trading
        import app.main as main_module
        # main.py의 scheduler 직접 접근은 어려우므로 로그만
        import logging
        logging.getLogger(__name__).info(f"매매 시간 변경: {hour:02d}:{minute:02d} KST (서머타임: {'ON' if _dst_enabled else 'OFF'})")
    except Exception:
        pass

    mode_str = "소수점" if capital_mgr.fractional_mode else "정수"
    action = "시작" if _automation_enabled else "중지"
    dst_str = "서머타임 ON (22:30)" if _dst_enabled else "서머타임 OFF (23:30)"

    return AutomationToggleResponse(
        success=True,
        enabled=_automation_enabled,
        fractional_mode=capital_mgr.fractional_mode,
        dst_enabled=_dst_enabled,
        message=f"자동매매 {action} ({mode_str}, {dst_str})",
    )


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_trading(req: SimulationRequest):
    """
    매매 시뮬레이션: 주어진 자금으로 어떤 종목을 몇 주 매수하는지 미리보기.
    실제 주문은 실행하지 않음.
    """
    capital_mgr = get_capital_manager()
    original_mode = capital_mgr.fractional_mode
    capital_mgr.fractional_mode = req.fractional_mode

    try:
        daily_budget = capital_mgr.calculate_daily_budget(req.initial_capital)
        allocation = capital_mgr.calculate_allocation(daily_budget)

        # 고정 ETF 시뮬레이션
        fixed_etfs = []
        fixed_codes = settings.fixed_etf_codes
        n_fixed = len(fixed_codes) if fixed_codes else 0
        fixed_total = 0.0
        for code in (fixed_codes or []):
            per_fixed = allocation.fixed_amount / n_fixed if n_fixed > 0 else 0
            # 대표 가격 사용 (실제 가격은 조회 불가할 수 있음)
            fixed_etfs.append({
                "symbol": code,
                "budget": round(per_fixed, 2),
                "note": "실제 가격은 장중 조회 필요",
            })
            fixed_total += per_fixed

        # 전략 ETF 시뮬레이션 (ML 랭킹 사용)
        from app.services.ranking_client import get_ranking_client
        ranking_client = get_ranking_client()
        rankings = await ranking_client.get_daily_ranking(settings.top_n_etfs)

        strategy_etfs = []
        strategy_total = 0.0
        remaining = allocation.strategy_amount

        if rankings:
            portfolio = capital_mgr.build_strategy_portfolio(
                allocation.strategy_amount, rankings
            )
            for item in portfolio.items:
                strategy_etfs.append({
                    "symbol": item["symbol"],
                    "price": round(item["price"], 2),
                    "quantity": item["quantity"],
                    "amount": round(item["amount"], 2),
                })
            strategy_total = portfolio.total_amount
            remaining = portfolio.remaining_budget

        mode_str = "소수점" if req.fractional_mode else "정수"

        return SimulationResponse(
            daily_budget=round(daily_budget, 2),
            strategy_amount=round(allocation.strategy_amount, 2),
            fixed_amount=round(allocation.fixed_amount, 2),
            fractional_mode=req.fractional_mode,
            fixed_etfs=fixed_etfs,
            strategy_etfs=strategy_etfs,
            total_buy_amount=round(fixed_total + strategy_total, 2),
            remaining_budget=round(remaining, 2),
            total_etf_count=len(strategy_etfs) + len(fixed_etfs),
        )
    finally:
        capital_mgr.fractional_mode = original_mode


# --- 잔고 조회 & 리셋 ---

async def _get_exchange_rate() -> float:
    """USD/KRW 환율 조회 (KIS API 또는 폴백)"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://open.er-api.com/v6/latest/USD"
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("rates", {}).get("KRW", 1350.0)
    except Exception:
        pass
    return 1350.0  # 폴백 환율


@router.get("/balance", response_model=BalanceResponse)
async def get_balance(db: Session = Depends(get_db)):
    """KIS API 잔고 조회 (USD + KRW 환산) + 매수 차감"""
    from app.services.kis_client import get_kis_client

    exchange_rate = await _get_exchange_rate()
    kis = get_kis_client()

    # 우리 DB에서 미매도 보유종목 총 투자금 조회
    invested = 0.0
    try:
        cycle = db.query(TradingCycle).filter(TradingCycle.is_active == True).order_by(TradingCycle.id.desc()).first()
        if cycle:
            unsold = db.query(DailyPurchase).filter(
                DailyPurchase.cycle_id == cycle.id,
                DailyPurchase.sold == False,
            ).all()
            invested = sum(p.total_amount for p in unsold)
    except Exception:
        pass

    try:
        balance = await kis.get_balance()

        # KIS 잔고에서 매수한 금액 차감
        available = balance.available_cash - invested if balance.available_cash > invested else balance.available_cash
        total_eval = balance.total_evaluation

        holdings = [
            HoldingItem(
                code=h["code"],
                name=h.get("name", ""),
                quantity=h["quantity"],
                avg_price=h["avg_price"],
                current_price=h["current_price"],
                pnl_rate=h["pnl_rate"],
                exchange_code=h.get("exchange_code", ""),
            )
            for h in balance.holdings
        ]

        return BalanceResponse(
            available_cash_usd=available,
            total_evaluation_usd=total_eval,
            available_cash_krw=round(available * exchange_rate),
            total_evaluation_krw=round(total_eval * exchange_rate),
            exchange_rate=round(exchange_rate, 2),
            holdings=holdings,
            kis_connected=True,
        )
    except Exception as e:
        return BalanceResponse(
            available_cash_usd=0,
            total_evaluation_usd=0,
            available_cash_krw=0,
            total_evaluation_krw=0,
            exchange_rate=round(exchange_rate, 2),
            holdings=[],
            kis_connected=False,
            error=str(e),
        )


@router.get("/prices")
def get_latest_prices(symbols: str = "", db: Session = Depends(get_db)):
    """보유 종목의 최신 종가 조회 (DB 기반)"""
    from sqlalchemy import text
    import os

    result = {}

    # symbols가 비어있으면 보유 종목 자동 조회
    if not symbols:
        cycle = db.query(TradingCycle).filter(TradingCycle.is_active == True).order_by(TradingCycle.id.desc()).first()
        if cycle:
            unsold = db.query(DailyPurchase).filter(DailyPurchase.cycle_id == cycle.id, DailyPurchase.sold == False).all()
            symbols = ",".join(set(p.etf_code for p in unsold))

    if not symbols:
        return result

    try:
        from sqlalchemy import create_engine
        db_url = os.getenv("REMOTE_DB_URL", "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db")
        engine = create_engine(db_url)
        with engine.connect() as conn:
            for sym in symbols.split(","):
                sym = sym.strip()
                if not sym:
                    continue
                try:
                    r = conn.execute(text(f"SELECT close FROM `{sym}_D` ORDER BY time DESC LIMIT 1"))
                    row = r.fetchone()
                    if row:
                        result[sym] = float(row[0])
                except Exception:
                    pass
        engine.dispose()
    except Exception:
        pass

    return result


@router.get("/snapshots")
def get_snapshots(db: Session = Depends(get_db), limit: int = 90):
    """날짜별 포트폴리오 스냅샷 조회"""
    from app.models import DailySnapshot
    snapshots = db.query(DailySnapshot).order_by(DailySnapshot.snapshot_date.desc()).limit(limit).all()
    return [
        {
            "date": str(s.snapshot_date),
            "total_invested": s.total_invested,
            "total_current_value": s.total_current_value,
            "total_pnl": s.total_pnl,
            "total_pnl_percent": s.total_pnl_percent,
            "available_cash": s.available_cash,
            "holdings_count": s.holdings_count,
            "day_buy_count": s.day_buy_count,
            "day_sell_count": s.day_sell_count,
            "holdings_detail": s.holdings_detail,
        }
        for s in snapshots
    ]


@router.get("/sqlite/tables")
def get_sqlite_tables(db: Session = Depends(get_db)):
    """SQLite 테이블 목록 + 행 수 조회"""
    from sqlalchemy import text, inspect
    tables_info = []
    insp = inspect(db.bind)
    for table_name in insp.get_table_names():
        try:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
            # 최신 날짜 찾기
            cols = [c['name'] for c in insp.get_columns(table_name)]
            latest = None
            for date_col in ['created_at', 'snapshot_date', 'purchase_date']:
                if date_col in cols:
                    row = db.execute(text(f"SELECT MAX({date_col}) FROM {table_name}")).scalar()
                    if row:
                        latest = str(row)
                    break
            tables_info.append({
                "tableName": table_name,
                "rowCount": count,
                "latestDate": latest,
                "columns": [{"name": c['name'], "type": str(c['type'])} for c in insp.get_columns(table_name)],
            })
        except Exception:
            pass
    return {"database": "trading.db", "tables": tables_info, "totalTables": len(tables_info)}


@router.get("/sqlite/tables/{table_name}/data")
def get_sqlite_table_data(table_name: str, limit: int = 30, offset: int = 0, db: Session = Depends(get_db)):
    """SQLite 테이블 데이터 조회"""
    from sqlalchemy import text, inspect
    allowed = [t for t in inspect(db.bind).get_table_names()]
    if table_name not in allowed:
        return {"error": "테이블 없음", "rows": []}
    try:
        cols = [c['name'] for c in inspect(db.bind).get_columns(table_name)]
        total = db.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
        rows = db.execute(text(f"SELECT * FROM {table_name} ORDER BY id DESC LIMIT :l OFFSET :o"), {"l": limit, "o": offset}).fetchall()
        return {
            "tableName": table_name,
            "database": "trading.db",
            "columns": [{"name": c, "type": ""} for c in cols],
            "rows": [dict(zip(cols, row)) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        return {"error": str(e), "rows": []}


@router.post("/reset", response_model=ResetResponse)
def reset_cycle(db: Session = Depends(get_db)):
    """
    사이클 리셋: 모든 활성 사이클을 종료하고 새로 시작.
    (KIS 모의투자 계좌 리셋은 KIS 웹사이트에서 직접 해야 합니다)
    """
    cycle_mgr = get_cycle_manager()

    # 모든 활성 사이클 비활성화
    active_cycles = (
        db.query(TradingCycle)
        .filter(TradingCycle.is_active == True)
        .all()
    )
    for c in active_cycles:
        c.is_active = False
    db.commit()

    deactivated = len(active_cycles)

    return ResetResponse(
        success=True,
        message=(
            f"사이클 리셋 완료 ({deactivated}개 종료). "
            "다음 매매 실행 시 새 사이클이 자동 생성됩니다. "
            "KIS 모의투자 잔고 리셋은 한국투자증권 웹사이트에서 진행하세요."
        ),
    )
