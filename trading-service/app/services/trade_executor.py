import asyncio
import logging
from datetime import date

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import OrderLog
from app.services.kis_client import get_kis_client, OrderResult
from app.services.ranking_client import get_ranking_client
from app.services.capital_manager import get_capital_manager
from app.services.cycle_manager import get_cycle_manager
from app.services.holiday_calendar import is_trading_day

logger = logging.getLogger(__name__)

MAX_RETRY = 3
RETRY_DELAYS = [1, 3, 9]  # 지수 백오프


async def _retry_order(coro_factory, etf_code: str, order_type: str) -> OrderResult:
    """주문 재시도 (최대 3회, 지수 백오프)"""
    last_result = OrderResult(success=False, message="재시도 미실행")
    for attempt in range(MAX_RETRY):
        result = await coro_factory()
        if result.success:
            return result
        last_result = result
        logger.warning(
            f"{order_type} 주문 실패 ({etf_code}, 시도 {attempt + 1}/{MAX_RETRY}): "
            f"{result.message}"
        )
        if attempt < MAX_RETRY - 1:
            await asyncio.sleep(RETRY_DELAYS[attempt])
    return last_result


def _log_order(
    db: Session,
    cycle_id: int,
    order_type: str,
    etf_code: str,
    quantity: float,
    result: OrderResult,
    retry_count: int = 0,
):
    """주문 로그 기록"""
    log = OrderLog(
        cycle_id=cycle_id,
        order_type=order_type,
        etf_code=etf_code,
        quantity=quantity,
        price=result.price if result.success else None,
        order_id=result.order_id,
        status="SUCCESS" if result.success else "FAILED",
        error_message=None if result.success else result.message,
        retry_count=retry_count,
    )
    db.add(log)
    db.commit()


async def _execute_fixed_etf_buying(
    db: Session,
    cycle_id: int,
    day: int,
    fixed_amount: float,
    kis,
    capital_mgr,
) -> tuple[int, float, list[dict]]:
    """
    30% 고정 ETF 매수 실행.
    Returns: (bought_count, bought_total, purchase_items)
    """
    bought_count = 0
    bought_total = 0.0
    purchase_items = []

    fixed_codes = settings.fixed_etf_codes
    if not fixed_codes:
        logger.info("고정 ETF 코드가 설정되지 않음 — 고정 매수 스킵")
        return bought_count, bought_total, purchase_items

    n_fixed = len(fixed_codes)
    logger.info(
        f"고정 ETF 매수: {fixed_codes}, 총 자금 ${fixed_amount:,.2f}, "
        f"ETF당 ${fixed_amount / n_fixed:,.2f}"
    )

    for code in fixed_codes:
        price = await kis.get_current_price(code)
        if price is None or price <= 0:
            logger.warning(f"고정 ETF 현재가 조회 실패: {code}, 스킵")
            continue

        qty = capital_mgr.get_fixed_etf_quantity(fixed_amount, price, n_fixed)
        if qty <= 0:
            logger.warning(f"고정 ETF 매수 수량 0: {code} (가격 ${price:.2f}, 예산 부족)")
            continue

        result = await _retry_order(
            lambda c=code, q=qty: kis.buy_order(c, q),
            code,
            "BUY_FIXED",
        )
        _log_order(db, cycle_id, "BUY_FIXED", code, qty, result)

        if result.success:
            buy_price = result.price if result.price > 0 else price
            purchase_items.append({
                "etf_code": code,
                "quantity": qty,
                "price": buy_price,
            })
            bought_count += 1
            bought_total += buy_price * qty
            logger.info(
                f"고정 ETF 매수 성공: {code} x {qty:.0f}주 @ ${buy_price:.2f}"
            )
        else:
            logger.error(f"고정 ETF 매수 실패: {code} — {result.message}")

    return bought_count, bought_total, purchase_items


async def _execute_strategy_buying(
    db: Session,
    cycle_id: int,
    day: int,
    strategy_amount: float,
    rankings: list,
    kis,
    capital_mgr,
) -> tuple[int, float, list[dict]]:
    """
    70% ML 전략 매수 실행.

    정수 모드: 예산 내에서 상위 종목부터 1주씩 매수 (예산 소진 시 중단)
    소수점 모드: 전체 종목에 균등 배분 (기존 방식)

    Returns: (bought_count, bought_total, purchase_items)
    """
    bought_count = 0
    bought_total = 0.0
    purchase_items = []

    # 포트폴리오 구성 (예산에 맞게 종목 선정)
    portfolio = capital_mgr.build_strategy_portfolio(strategy_amount, rankings)

    mode_str = "소수점" if capital_mgr.fractional_mode else "정수"
    logger.info(
        f"전략 매수 ({mode_str}): {portfolio.selected_count}개 종목 선정, "
        f"총 자금 ${strategy_amount:,.2f}, "
        f"예상 매수 ${portfolio.total_amount:,.2f}, "
        f"잔여 ${portfolio.remaining_budget:,.2f}"
    )

    for item in portfolio.items:
        symbol = item["symbol"]
        qty = item["quantity"]
        price = item["price"]

        result = await _retry_order(
            lambda c=symbol, q=qty: kis.buy_order(c, q),
            symbol,
            "BUY",
        )
        _log_order(db, cycle_id, "BUY", symbol, qty, result)

        if result.success:
            buy_price = result.price if result.price > 0 else price
            purchase_items.append({
                "etf_code": symbol,
                "quantity": qty,
                "price": buy_price,
            })
            bought_count += 1
            bought_total += buy_price * qty
        else:
            logger.warning(f"전략 매수 실패: {symbol} — {result.message}")

    return bought_count, bought_total, purchase_items


async def execute_daily_trading(db: Session = None) -> dict:
    """
    일일 매매 실행 오케스트레이터.

    전략:
    - 일일 예산 = 초기 자금 / 63
    - 30%: 고정 ETF (QQQ 등) 매수
    - 70%: ML 랭킹 상위 종목 매수 (예산 내에서 1주씩)
    - Day >= 64: FIFO 매도 (Day 1 매수분 매도)

    Returns: 실행 결과 요약 dict
    """
    own_session = False
    if db is None:
        db = SessionLocal()
        own_session = True

    try:
        today = date.today()

        # 1. 거래일 확인 (NYSE 달력 기준)
        if not is_trading_day(today):
            logger.info(f"{today}는 NYSE 휴장일 — 매매 스킵")
            return {
                "success": True,
                "message": f"{today}는 NYSE 휴장일입니다.",
                "day_number": 0,
                "sold_count": 0,
                "bought_count": 0,
                "sold_total": 0.0,
                "bought_total": 0.0,
            }

        kis = get_kis_client()
        ranking_client = get_ranking_client()
        capital_mgr = get_capital_manager()
        cycle_mgr = get_cycle_manager()

        mode_str = "소수점" if capital_mgr.fractional_mode else "정수"
        logger.info(f"매매 모드: {mode_str}")

        # 2. 잔고 조회 및 사이클 관리
        balance = await kis.get_balance()
        total_cash = balance.available_cash
        if total_cash <= 0:
            total_cash = 100_000  # 기본값 (모의투자 $100,000)
            logger.warning(
                f"잔고 조회 불가, 기본 자금 ${total_cash:,.2f} 사용"
            )

        cycle = cycle_mgr.get_or_create_active_cycle(db, initial_capital=total_cash)

        # 3. 거래일 번호
        day = cycle_mgr.get_current_trading_day(cycle)
        cycle_mgr.update_day_number(db, cycle, day)
        logger.info(f"=== 매매 실행: 사이클 {cycle.id}, 거래일 {day} ({mode_str}) ===")

        # 4. 랭킹 조회
        rankings = await ranking_client.get_daily_ranking(settings.top_n_etfs)
        if not rankings:
            return {
                "success": False,
                "message": "ml-service 랭킹 조회 실패 — 당일 매매 중단",
                "day_number": day,
                "sold_count": 0,
                "bought_count": 0,
                "sold_total": 0.0,
                "bought_total": 0.0,
            }

        sold_count = 0
        sold_total = 0.0
        bought_count = 0
        bought_total = 0.0

        # 5. Day >= 64: FIFO 매도
        if day >= settings.cycle_trading_days + 1:
            old_purchases = cycle_mgr.get_purchases_to_sell(db, cycle.id, day)
            for purchase in old_purchases:
                result = await _retry_order(
                    lambda p=purchase: kis.sell_order(p.etf_code, p.quantity),
                    purchase.etf_code,
                    "SELL",
                )
                _log_order(
                    db, cycle.id, "SELL", purchase.etf_code,
                    purchase.quantity, result,
                )

                if result.success:
                    sell_price = result.price if result.price > 0 else purchase.price
                    cycle_mgr.mark_as_sold(
                        db, [purchase.id], sell_price, today
                    )
                    sold_count += 1
                    sold_total += sell_price * purchase.quantity
                else:
                    logger.error(
                        f"매도 최종 실패: {purchase.etf_code} — {result.message}"
                    )

            logger.info(f"매도 완료: {sold_count}건, 총 ${sold_total:,.2f}")

        # 6. 일일 매수 예산 계산 (초기 자금 / 63)
        daily_budget = capital_mgr.calculate_daily_budget(cycle.initial_capital)
        allocation = capital_mgr.calculate_allocation(daily_budget)
        logger.info(
            f"일일 예산: ${daily_budget:,.2f} "
            f"(전략 70%: ${allocation.strategy_amount:,.2f}, "
            f"고정 30%: ${allocation.fixed_amount:,.2f})"
        )

        # 7. 고정 ETF 매수 (30%)
        fixed_count, fixed_total, fixed_items = await _execute_fixed_etf_buying(
            db, cycle.id, day, allocation.fixed_amount, kis, capital_mgr
        )
        bought_count += fixed_count
        bought_total += fixed_total

        # 8. 전략 매수 (70%) — ML 랭킹 기반
        strategy_count, strategy_total, strategy_items = await _execute_strategy_buying(
            db, cycle.id, day, allocation.strategy_amount, rankings, kis, capital_mgr
        )
        bought_count += strategy_count
        bought_total += strategy_total

        # 9. 매수 기록
        all_items = fixed_items + strategy_items
        if all_items:
            cycle_mgr.record_purchases(db, cycle.id, day, all_items)

        summary = (
            f"day {day} ({mode_str}): 매도 {sold_count}건(${sold_total:,.2f}), "
            f"매수 {bought_count}건(${bought_total:,.2f}) "
            f"[고정 {fixed_count}건 + 전략 {strategy_count}건]"
        )
        logger.info(f"=== 매매 완료: {summary} ===")

        # 10. 일일 스냅샷 저장
        try:
            _save_daily_snapshot(
                db, cycle, today, total_cash,
                bought_count, sold_count, bought_total, sold_total,
            )
        except Exception as snap_err:
            logger.warning(f"스냅샷 저장 실패: {snap_err}")

        return {
            "success": True,
            "message": summary,
            "day_number": day,
            "sold_count": sold_count,
            "bought_count": bought_count,
            "sold_total": sold_total,
            "bought_total": bought_total,
        }

    except Exception as e:
        logger.exception(f"매매 실행 중 오류: {e}")
        return {
            "success": False,
            "message": f"매매 실행 중 오류: {str(e)}",
            "day_number": 0,
            "sold_count": 0,
            "bought_count": 0,
            "sold_total": 0.0,
            "bought_total": 0.0,
        }
    finally:
        if own_session:
            db.close()


def _save_daily_snapshot(
    db, cycle, today, total_cash,
    buy_count, sell_count, buy_total, sell_total,
):
    """매매 완료 후 일일 포트폴리오 스냅샷 저장"""
    import json
    from app.models import DailySnapshot, DailyPurchase

    # 미매도 보유종목 조회
    unsold = db.query(DailyPurchase).filter(
        DailyPurchase.cycle_id == cycle.id,
        DailyPurchase.sold == False,
    ).all()

    total_invested = sum(p.total_amount for p in unsold)
    available = total_cash - total_invested
    holdings_count = len(unsold)

    # 종목별 상세 (JSON)
    holdings_detail = json.dumps([
        {
            "etf_code": p.etf_code,
            "quantity": p.quantity,
            "buy_price": p.price,
            "total_amount": p.total_amount,
            "day": p.trading_day_number,
        }
        for p in unsold
    ], ensure_ascii=False)

    # 기존 스냅샷이 있으면 업데이트, 없으면 생성
    existing = db.query(DailySnapshot).filter(DailySnapshot.snapshot_date == today).first()
    if existing:
        existing.total_invested = total_invested
        existing.total_current_value = total_invested  # 장 열리면 업데이트 필요
        existing.total_pnl = 0
        existing.total_pnl_percent = 0
        existing.available_cash = available
        existing.holdings_count = holdings_count
        existing.day_buy_count = buy_count
        existing.day_sell_count = sell_count
        existing.holdings_detail = holdings_detail
    else:
        snapshot = DailySnapshot(
            snapshot_date=today,
            cycle_id=cycle.id,
            total_invested=total_invested,
            total_current_value=total_invested,
            total_pnl=0,
            total_pnl_percent=0,
            available_cash=available,
            holdings_count=holdings_count,
            day_buy_count=buy_count,
            day_sell_count=sell_count,
            holdings_detail=holdings_detail,
        )
        db.add(snapshot)

    db.commit()
    logger.info(f"스냅샷 저장: {today} | 투자 ${total_invested:,.2f} | {holdings_count}종목")
