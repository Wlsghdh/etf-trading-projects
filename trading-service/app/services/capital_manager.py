import math
from dataclasses import dataclass

from app.config import settings


@dataclass
class Allocation:
    strategy_amount: float  # 70% ML 전략 자금
    fixed_amount: float     # 30% 고정 ETF 자금


@dataclass
class StrategyPortfolio:
    """예산에 맞춘 매수 대상 목록"""
    items: list  # [{symbol, price, quantity, amount}]
    total_amount: float
    remaining_budget: float
    selected_count: int  # 실제 매수 종목 수


class CapitalManager:
    """자금 배분 관리 (정수/소수점 매매 지원)"""

    def __init__(self):
        self._fractional_mode = False  # 기본: 정수 매매

    @property
    def fractional_mode(self) -> bool:
        return self._fractional_mode

    @fractional_mode.setter
    def fractional_mode(self, value: bool):
        self._fractional_mode = value

    def calculate_daily_budget(self, initial_capital: float) -> float:
        """일일 매수 예산 = 총 자금 / 63"""
        if settings.cycle_trading_days <= 0:
            return 0.0
        return initial_capital / settings.cycle_trading_days

    def calculate_allocation(self, daily_budget: float) -> Allocation:
        """일일 예산을 전략(70%) / 고정(30%) 배분"""
        strategy = daily_budget * settings.strategy_ratio
        fixed = daily_budget * settings.fixed_ratio
        return Allocation(strategy_amount=strategy, fixed_amount=fixed)

    def get_quantity(self, amount: float, price: float) -> float:
        """매수 가능 수량 계산"""
        if price <= 0:
            return 0.0
        if self._fractional_mode:
            return round(amount / price, 4)
        else:
            return float(math.floor(amount / price))

    def get_fixed_etf_quantity(self, fixed_amount: float, price: float, n_fixed: int) -> float:
        """고정 ETF 매수 수량"""
        if price <= 0 or n_fixed <= 0:
            return 0.0
        per_fixed = fixed_amount / n_fixed
        return self.get_quantity(per_fixed, price)

    def build_strategy_portfolio(
        self,
        strategy_amount: float,
        rankings: list,
    ) -> StrategyPortfolio:
        """
        예산에 맞게 상위 종목부터 1주씩 매수 포트폴리오 구성.

        정수 매매 모드:
          - 랭킹 상위부터 순서대로 1주씩 담을 수 있는지 확인
          - 예산이 남으면 다음 종목으로 이동
          - 예산 부족하면 중단

        소수점 매매 모드:
          - 전체 종목에 균등 배분 (기존 로직)
        """
        items = []
        total_amount = 0.0
        remaining = strategy_amount

        if self._fractional_mode:
            # 소수점 모드: 전체 종목 균등 배분
            n = len(rankings)
            if n == 0:
                return StrategyPortfolio([], 0.0, remaining, 0)
            per_etf = strategy_amount / n
            for etf in rankings:
                price = etf.current_close or 0
                if price <= 0:
                    continue
                qty = round(per_etf / price, 4)
                if qty <= 0:
                    continue
                amount = qty * price
                items.append({
                    "symbol": etf.symbol,
                    "price": price,
                    "quantity": qty,
                    "amount": amount,
                })
                total_amount += amount
                remaining -= amount
        else:
            # 정수 모드: 상위부터 1주씩 예산 내에서 담기
            for etf in rankings:
                price = etf.current_close or 0
                if price <= 0:
                    continue
                if price > remaining:
                    # 이 종목은 1주도 살 수 없음 → 다음 종목 시도
                    continue
                qty = 1.0
                amount = price * qty
                items.append({
                    "symbol": etf.symbol,
                    "price": price,
                    "quantity": qty,
                    "amount": amount,
                })
                total_amount += amount
                remaining -= amount

                if remaining <= 0:
                    break

        return StrategyPortfolio(
            items=items,
            total_amount=total_amount,
            remaining_budget=remaining,
            selected_count=len(items),
        )


# 싱글턴
_capital_manager = CapitalManager()


def get_capital_manager() -> CapitalManager:
    return _capital_manager
