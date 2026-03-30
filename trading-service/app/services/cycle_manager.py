import logging
from datetime import date

from sqlalchemy.orm import Session

from app.config import settings
from app.models import TradingCycle, DailyPurchase
from app.services.holiday_calendar import get_trading_day_number_since

logger = logging.getLogger(__name__)


class CycleManager:
    """63일 FIFO 순환 매매 관리"""

    def get_or_create_active_cycle(
        self, db: Session, initial_capital: float = 0.0
    ) -> TradingCycle:
        """활성 사이클 조회, 없으면 새로 생성"""
        cycle = (
            db.query(TradingCycle)
            .filter(TradingCycle.is_active == True)
            .order_by(TradingCycle.id.desc())
            .first()
        )
        if cycle:
            return cycle

        # 새 사이클 생성
        strategy = initial_capital * settings.strategy_ratio
        fixed = initial_capital * settings.fixed_ratio

        cycle = TradingCycle(
            cycle_start_date=date.today(),
            current_day_number=1,
            initial_capital=initial_capital,
            strategy_capital=strategy,
            fixed_capital=fixed,
            trading_mode=settings.trading_mode,
            is_active=True,
        )
        db.add(cycle)
        db.commit()
        db.refresh(cycle)
        logger.info(
            f"새 사이클 생성: id={cycle.id}, 자금={initial_capital:,.0f}"
        )
        return cycle

    def get_current_trading_day(self, cycle: TradingCycle) -> int:
        """NYSE 달력 기준 거래일 카운트"""
        today = date.today()
        day_num = get_trading_day_number_since(cycle.cycle_start_date, today)
        return max(day_num, 1)

    def get_purchases_to_sell(
        self, db: Session, cycle_id: int, current_day: int
    ) -> list[DailyPurchase]:
        """
        현재 거래일에서 63일 전 매수분 조회 (FIFO 매도 대상).
        Day 64 → Day 1 매수분 매도
        Day 65 → Day 2 매수분 매도 ...
        """
        sell_day = current_day - settings.cycle_trading_days
        if sell_day < 1:
            return []

        purchases = (
            db.query(DailyPurchase)
            .filter(
                DailyPurchase.cycle_id == cycle_id,
                DailyPurchase.trading_day_number == sell_day,
                DailyPurchase.sold == False,
            )
            .all()
        )
        logger.info(
            f"FIFO 매도 대상: day {sell_day} 매수분 {len(purchases)}건"
        )
        return purchases

    def record_purchases(
        self,
        db: Session,
        cycle_id: int,
        day_number: int,
        items: list[dict],
    ) -> list[DailyPurchase]:
        """매수 내역 기록"""
        purchases = []
        for item in items:
            purchase = DailyPurchase(
                cycle_id=cycle_id,
                trading_day_number=day_number,
                purchase_date=date.today(),
                etf_code=item["etf_code"],
                quantity=item["quantity"],
                price=item["price"],
                total_amount=item["quantity"] * item["price"],
            )
            db.add(purchase)
            purchases.append(purchase)

        db.commit()
        for p in purchases:
            db.refresh(p)
        logger.info(f"매수 {len(purchases)}건 기록 완료 (day {day_number})")
        return purchases

    def mark_as_sold(
        self,
        db: Session,
        purchase_ids: list[int],
        sold_price: float,
        sold_date: date,
    ):
        """매도 완료 처리"""
        purchases = (
            db.query(DailyPurchase)
            .filter(DailyPurchase.id.in_(purchase_ids))
            .all()
        )
        for p in purchases:
            p.sold = True
            p.sold_date = sold_date
            p.sold_price = sold_price
            p.sell_pnl = (sold_price - p.price) * p.quantity

        db.commit()
        logger.info(f"매도 완료 처리: {len(purchases)}건")

    def update_day_number(self, db: Session, cycle: TradingCycle, day_number: int):
        """사이클 거래일 번호 업데이트"""
        cycle.current_day_number = day_number
        db.commit()

    def get_unsold_purchases(self, db: Session, cycle_id: int) -> list[DailyPurchase]:
        """미매도 보유 내역 조회"""
        return (
            db.query(DailyPurchase)
            .filter(
                DailyPurchase.cycle_id == cycle_id,
                DailyPurchase.sold == False,
            )
            .order_by(DailyPurchase.trading_day_number.asc())
            .all()
        )

    def create_new_cycle(
        self, db: Session, initial_capital: float
    ) -> TradingCycle:
        """기존 활성 사이클 비활성 후 새 사이클 생성"""
        # 기존 활성 사이클 비활성
        active_cycles = (
            db.query(TradingCycle)
            .filter(TradingCycle.is_active == True)
            .all()
        )
        for c in active_cycles:
            c.is_active = False
        db.commit()

        strategy = initial_capital * settings.strategy_ratio
        fixed = initial_capital * settings.fixed_ratio

        cycle = TradingCycle(
            cycle_start_date=date.today(),
            current_day_number=1,
            initial_capital=initial_capital,
            strategy_capital=strategy,
            fixed_capital=fixed,
            trading_mode=settings.trading_mode,
            is_active=True,
        )
        db.add(cycle)
        db.commit()
        db.refresh(cycle)
        logger.info(
            f"새 사이클 강제 생성: id={cycle.id}, 자금={initial_capital:,.0f}"
        )
        return cycle


# 싱글턴
_cycle_manager = CycleManager()


def get_cycle_manager() -> CycleManager:
    return _cycle_manager
