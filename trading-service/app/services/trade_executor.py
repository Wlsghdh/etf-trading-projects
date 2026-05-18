import asyncio
import logging
import os
from datetime import date

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal
from app.models import OrderLog, TradingLog
from app.services.kis_client import get_kis_client, OrderResult
from app.services.ranking_client import get_ranking_client
from app.services.capital_manager import get_capital_manager
from app.services.cycle_manager import get_cycle_manager
from app.services.holiday_calendar import is_trading_day

logger = logging.getLogger(__name__)

MAX_RETRY = 3
RETRY_DELAYS = [1, 3, 9]  # 지수 백오프


def _write_trading_log(db: Session, level: str, message: str, symbol: str = None, order_type: str = None):
    """트레이딩 로그를 DB에 기록 (웹 모니터링용)"""
    try:
        log = TradingLog(level=level, message=message, symbol=symbol, order_type=order_type)
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()


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
    limit_price: float = None,
):
    """주문 로그 기록"""
    status = "SUCCESS" if result.success else "FAILED"
    log = OrderLog(
        cycle_id=cycle_id,
        order_type=order_type,
        etf_code=etf_code,
        quantity=quantity,
        price=result.price if result.success else None,
        limit_price=limit_price,
        order_id=result.order_id,
        status=status,
        error_message=None if result.success else result.message,
        retry_count=retry_count,
    )
    db.add(log)
    db.commit()

    # 웹 모니터링용 로그
    level = "INFO" if result.success else "ERROR"
    price_str = f"${result.price:.2f}" if result.success and result.price else "N/A"
    limit_str = f" (지정가 ${limit_price:.2f})" if limit_price else ""
    msg = f"{order_type} {etf_code} x{quantity:.0f}주 @ {price_str}{limit_str} → {status}"
    if not result.success:
        msg += f" [{result.message}]"
    _write_trading_log(db, level, msg, symbol=etf_code, order_type=order_type)


def _get_previous_close_prices(symbols: list[str]) -> dict[str, float]:
    """전일 종가 조회 (원격 MySQL DB에서) - 일봉 데이터만 사용, 이상치 필터링"""
    prices = {}
    try:
        from sqlalchemy import create_engine
        db_url = os.getenv("REMOTE_DB_URL", "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db")
        engine = create_engine(db_url)
        with engine.connect() as conn:
            for sym in symbols:
                try:
                    # 최근 5일 데이터를 가져와서 이상치 필터링
                    r = conn.execute(text(
                        f"SELECT close, time FROM `{sym}_D` "
                        f"WHERE DATE(time) = time "  # 시간 부분이 00:00:00인 행만 (일봉)
                        f"ORDER BY time DESC LIMIT 5"
                    ))
                    rows = r.fetchall()
                    if rows:
                        # 최근 종가들의 중앙값 기준으로 이상치 제거
                        closes = [float(row[0]) for row in rows if row[0]]
                        if closes:
                            median = sorted(closes)[len(closes) // 2]
                            # 중앙값 대비 3배 이상 차이나는 값은 제외
                            valid = [c for c in closes if 0.33 * median < c < 3 * median]
                            prices[sym] = valid[0] if valid else closes[0]
                except Exception:
                    pass
        engine.dispose()
    except Exception as e:
        logger.error(f"전일 종가 조회 실패: {e}")
    return prices


async def _check_pending_order_status(db: Session, cycle_id: int, kis) -> tuple[int, int]:
    """
    PENDING 주문의 KIS 체결 상태를 조회하여 SUCCESS/UNFILLED로 업데이트.

    Returns:
        (filled_count, unfilled_count)
    """
    pending_orders = db.query(OrderLog).filter(
        OrderLog.cycle_id == cycle_id,
        OrderLog.status == "PENDING",
        OrderLog.order_type.in_(["BUY", "BUY_FIXED"]),
        OrderLog.order_id.isnot(None),
    ).all()

    filled = 0
    unfilled = 0

    for order in pending_orders:
        try:
            # KIS 체결조회 API 호출
            status_data = await kis.get_order_status(order.order_id)
            output1 = status_data.get("output1", []) if isinstance(status_data, dict) else []

            # 체결 여부 확인 (실제 체결 수량 > 0)
            executed = False
            executed_price = 0.0
            for item in output1:
                if item.get("odno") == order.order_id:
                    ccld_qty = float(item.get("ccld_qty", 0))  # 체결 수량
                    if ccld_qty > 0:
                        executed = True
                        # 평균 체결가
                        executed_price = float(item.get("avg_prvs", 0)) or float(item.get("ft_ccld_unpr3", 0))
                        break

            if executed:
                order.status = "SUCCESS"
                if executed_price > 0:
                    order.price = executed_price
                logger.info(f"지정가 체결 확인: {order.etf_code} {order.quantity}주 @ ${executed_price:.2f}")
                filled += 1
            else:
                # 미체결 (체결 수량 0)
                pass  # _get_unfilled_carryover에서 UNFILLED로 처리
        except Exception as e:
            logger.warning(f"체결 조회 실패 {order.etf_code} (order_id={order.order_id}): {e}")

    if filled > 0:
        db.commit()
        logger.info(f"체결 확인 완료: {filled}건 체결됨, {len(pending_orders) - filled}건 미체결")

    return filled, len(pending_orders) - filled


def _get_unfilled_carryover(db: Session, cycle_id: int, today: date) -> float:
    """전일 미체결 주문의 이월 금액 계산 및 상태 업데이트.

    PENDING 상태로 남아있는 주문(_check_pending_order_status에서 SUCCESS로 전환되지 않은 주문)을
    UNFILLED로 표시하고 그 금액을 다음날 예산에 이월한다.
    """
    pending_orders = db.query(OrderLog).filter(
        OrderLog.cycle_id == cycle_id,
        OrderLog.status == "PENDING",
        OrderLog.order_type.in_(["BUY", "BUY_FIXED"]),
    ).all()

    carryover = 0.0
    for order in pending_orders:
        # 미체결 → UNFILLED로 상태 변경
        order.status = "UNFILLED"
        price = order.limit_price or order.price or 0
        carryover += price * order.quantity
        logger.info(
            f"미체결 이월: {order.etf_code} {order.quantity}주 "
            f"@ ${price:.2f} = ${price * order.quantity:.2f}"
        )

    if pending_orders:
        db.commit()
        logger.info(f"총 미체결 이월 금액: ${carryover:,.2f} ({len(pending_orders)}건)")

    return carryover


async def _execute_fixed_etf_buying(
    db: Session,
    cycle_id: int,
    day: int,
    fixed_amount: float,
    kis,
    capital_mgr,
    rankings: list = None,
    prev_close_prices: dict = None,
) -> tuple[int, float, list[dict]]:
    """
    30% 고정 ETF 매수 실행 (지정가: 전일 종가).
    Returns: (bought_count, bought_total, purchase_items)
    """
    bought_count = 0
    bought_total = 0.0
    purchase_items = []
    use_limit = settings.order_type == "limit"

    fixed_codes = settings.fixed_etf_codes
    if not fixed_codes:
        logger.info("고정 ETF 코드가 설정되지 않음 — 고정 매수 스킵")
        return bought_count, bought_total, purchase_items

    n_fixed = len(fixed_codes)
    order_mode = "지정가" if use_limit else "시장가"
    logger.info(
        f"고정 ETF 매수 ({order_mode}): {fixed_codes}, 총 자금 ${fixed_amount:,.2f}, "
        f"ETF당 ${fixed_amount / n_fixed:,.2f}"
    )

    for code in fixed_codes:
        # 가격 결정: 지정가면 전일 종가, 아니면 현재가
        price = None
        limit_price = None

        if use_limit and prev_close_prices and code in prev_close_prices:
            price = prev_close_prices[code]
            limit_price = price
            logger.info(f"고정 ETF {code} 지정가 설정: ${price:.2f} (전일 종가)")
        else:
            # 현재가 조회 (시장가 또는 전일 종가 없는 경우)
            price = await kis.get_current_price(code)
            if price is None or price <= 0:
                for r in rankings:
                    if r.symbol == code and r.current_close and r.current_close > 0:
                        price = r.current_close
                        logger.info(f"고정 ETF {code} 현재가를 ML 랭킹에서 가져옴: ${price:.2f}")
                        break

        if price is None or price <= 0:
            logger.warning(f"고정 ETF 가격 조회 실패: {code}, 스킵")
            continue

        qty = capital_mgr.get_fixed_etf_quantity(fixed_amount, price, n_fixed)
        if qty <= 0:
            logger.warning(f"고정 ETF 매수 수량 0: {code} (가격 ${price:.2f}, 예산 부족)")
            continue

        # 지정가 주문: price 전달, 시장가 주문: None
        order_price = limit_price if use_limit else None
        result = await _retry_order(
            lambda c=code, q=qty, p=order_price: kis.buy_order(c, q, p),
            code,
            "BUY_FIXED",
        )

        if use_limit and result.success:
            # 지정가 주문 접수됨 → PENDING (체결 여부는 다음 날 확인)
            log = OrderLog(
                cycle_id=cycle_id,
                order_type="BUY_FIXED",
                etf_code=code,
                quantity=qty,
                price=None,
                limit_price=limit_price,
                order_id=result.order_id,
                status="PENDING",
            )
            db.add(log)
            db.commit()

            purchase_items.append({
                "etf_code": code,
                "quantity": qty,
                "price": limit_price,
            })
            bought_count += 1
            bought_total += limit_price * qty
            logger.info(
                f"고정 ETF 지정가 주문 접수: {code} x {qty:.0f}주 @ ${limit_price:.2f}"
            )
        elif not use_limit:
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
                    f"고정 ETF 시장가 매수 성공: {code} x {qty:.0f}주 @ ${buy_price:.2f}"
                )
            else:
                logger.error(f"고정 ETF 매수 실패: {code} — {result.message}")
        else:
            _log_order(db, cycle_id, "BUY_FIXED", code, qty, result, limit_price=limit_price)
            logger.error(f"고정 ETF 지정가 주문 실패: {code} — {result.message}")

    return bought_count, bought_total, purchase_items


async def _execute_strategy_buying(
    db: Session,
    cycle_id: int,
    day: int,
    strategy_amount: float,
    rankings: list,
    kis,
    capital_mgr,
    prev_close_prices: dict = None,
) -> tuple[int, float, list[dict]]:
    """
    70% ML 전략 매수 실행 (지정가: 전일 종가).

    정수 모드: 예산 내에서 상위 종목부터 1주씩 매수 (예산 소진 시 중단)
    소수점 모드: 전체 종목에 균등 배분 (기존 방식)

    Returns: (bought_count, bought_total, purchase_items)
    """
    bought_count = 0
    bought_total = 0.0
    purchase_items = []
    use_limit = settings.order_type == "limit"

    # 포트폴리오 구성 (예산에 맞게 종목 선정)
    portfolio = capital_mgr.build_strategy_portfolio(strategy_amount, rankings)

    mode_str = "소수점" if capital_mgr.fractional_mode else "정수"
    order_mode = "지정가" if use_limit else "시장가"
    logger.info(
        f"전략 매수 ({mode_str}, {order_mode}): {portfolio.selected_count}개 종목 선정, "
        f"총 자금 ${strategy_amount:,.2f}, "
        f"예상 매수 ${portfolio.total_amount:,.2f}, "
        f"잔여 ${portfolio.remaining_budget:,.2f}"
    )

    for item in portfolio.items:
        symbol = item["symbol"]
        qty = item["quantity"]
        price = item["price"]

        # 지정가: 전일 종가 사용
        limit_price = None
        order_price = None
        if use_limit and prev_close_prices and symbol in prev_close_prices:
            limit_price = prev_close_prices[symbol]
            order_price = limit_price
        elif use_limit:
            # 전일 종가 없으면 ML 랭킹 가격 사용
            limit_price = price
            order_price = price

        result = await _retry_order(
            lambda c=symbol, q=qty, p=order_price: kis.buy_order(c, q, p),
            symbol,
            "BUY",
        )

        if use_limit and result.success:
            # 지정가 주문 접수 → PENDING
            log = OrderLog(
                cycle_id=cycle_id,
                order_type="BUY",
                etf_code=symbol,
                quantity=qty,
                price=None,
                limit_price=limit_price,
                order_id=result.order_id,
                status="PENDING",
            )
            db.add(log)
            db.commit()

            purchase_items.append({
                "etf_code": symbol,
                "quantity": qty,
                "price": limit_price,
            })
            bought_count += 1
            bought_total += limit_price * qty
        elif not use_limit:
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
        else:
            _log_order(db, cycle_id, "BUY", symbol, qty, result, limit_price=limit_price)
            logger.warning(f"전략 지정가 주문 실패: {symbol} — {result.message}")

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
        _write_trading_log(db, "INFO", f"=== 매매 실행 시작 ({mode_str}, {settings.order_type}) ===")

        # 2. 잔고 조회 및 사이클 관리
        balance = await kis.get_balance()
        total_cash = balance.available_cash
        _write_trading_log(db, "INFO", f"잔고 조회: ${total_cash:,.2f} (보유 {len(balance.holdings)}종목)")
        if total_cash <= 0:
            total_cash = 100_000  # 기본값 (모의투자 $100,000)
            _write_trading_log(db, "WARNING", f"잔고 조회 불가, 기본 자금 ${total_cash:,.2f} 사용")
            logger.warning(
                f"잔고 조회 불가, 기본 자금 ${total_cash:,.2f} 사용"
            )

        cycle = cycle_mgr.get_or_create_active_cycle(db, initial_capital=total_cash)

        # 3. 거래일 번호
        day = cycle_mgr.get_current_trading_day(cycle)
        cycle_mgr.update_day_number(db, cycle, day)
        logger.info(f"=== 매매 실행: 사이클 {cycle.id}, 거래일 {day} ({mode_str}) ===")

        # 4. 랭킹 조회
        _write_trading_log(db, "INFO", f"사이클 {cycle.id}, 거래일 {day} — ML 랭킹 조회 중...")
        rankings = await ranking_client.get_daily_ranking(settings.top_n_etfs)
        if not rankings:
            _write_trading_log(db, "ERROR", "ml-service 랭킹 조회 실패 — 당일 매매 중단")
            return {
                "success": False,
                "message": "ml-service 랭킹 조회 실패 — 당일 매매 중단",
                "day_number": day,
                "sold_count": 0,
                "bought_count": 0,
                "sold_total": 0.0,
                "bought_total": 0.0,
            }

        _write_trading_log(db, "INFO", f"ML 랭킹 조회 성공: {len(rankings)}개 종목 (1위: {rankings[0].symbol})")

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
            _write_trading_log(db, "INFO", f"FIFO 매도 완료: {sold_count}건, ${sold_total:,.2f}")

        # 6. PENDING 주문 체결 조회 + 미체결 이월 처리 (지정가 모드)
        carryover = 0.0
        if settings.order_type == "limit":
            # 6-1. KIS 체결조회로 PENDING → SUCCESS 전환 시도
            try:
                filled, unfilled = await _check_pending_order_status(db, cycle.id, kis)
                if filled > 0 or unfilled > 0:
                    _write_trading_log(db, "INFO", f"체결 확인: {filled}건 체결, {unfilled}건 미체결")
            except Exception as e:
                logger.warning(f"체결 조회 실패: {e}")

            # 6-2. 여전히 PENDING인 주문 → UNFILLED + 금액 이월
            carryover = _get_unfilled_carryover(db, cycle.id, today)
            if carryover > 0:
                logger.info(f"전일 미체결 이월 금액: ${carryover:,.2f}")
                _write_trading_log(db, "INFO", f"미체결 이월: ${carryover:,.2f} 추가")

        # 7. 일일 매수 예산 계산 (초기 자금 / 63 + 미체결 이월)
        daily_budget = capital_mgr.calculate_daily_budget(cycle.initial_capital)
        daily_budget += carryover  # 미체결 이월분 추가
        allocation = capital_mgr.calculate_allocation(daily_budget)
        budget_msg = (
            f"일일 예산: ${daily_budget:,.2f} "
            f"(전략 70%: ${allocation.strategy_amount:,.2f}, "
            f"고정 30%: ${allocation.fixed_amount:,.2f})"
            + (f" [이월 ${carryover:,.2f} 포함]" if carryover > 0 else "")
        )
        logger.info(budget_msg)
        _write_trading_log(db, "INFO", budget_msg)

        # 8. 전일 종가 조회 (지정가 모드용)
        prev_close_prices = {}
        if settings.order_type == "limit":
            all_symbols = [r.symbol for r in rankings[:settings.top_n_etfs]]
            all_symbols.extend(settings.fixed_etf_codes)
            prev_close_prices = _get_previous_close_prices(list(set(all_symbols)))
            logger.info(f"전일 종가 조회: {len(prev_close_prices)}개 종목")

        # 9. 고정 ETF 매수 (30%)
        fixed_count, fixed_total, fixed_items = await _execute_fixed_etf_buying(
            db, cycle.id, day, allocation.fixed_amount, kis, capital_mgr, rankings,
            prev_close_prices=prev_close_prices,
        )
        bought_count += fixed_count
        bought_total += fixed_total

        # 10. 전략 매수 (70%) — ML 랭킹 기반
        strategy_count, strategy_total, strategy_items = await _execute_strategy_buying(
            db, cycle.id, day, allocation.strategy_amount, rankings, kis, capital_mgr,
            prev_close_prices=prev_close_prices,
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
        _write_trading_log(db, "INFO", f"매매 완료: {summary}")

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
        try:
            _write_trading_log(db, "ERROR", f"매매 실행 중 오류: {str(e)}")
        except Exception:
            pass
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
