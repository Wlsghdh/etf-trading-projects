import pytest
from app.services.capital_manager import CapitalManager


@pytest.fixture
def mgr():
    return CapitalManager()


class TestCalculateAllocation:
    def test_default_ratio(self, mgr):
        alloc = mgr.calculate_allocation(10_000_000)
        assert alloc.strategy_amount == pytest.approx(7_000_000)
        assert alloc.fixed_amount == pytest.approx(3_000_000)

    def test_zero_balance(self, mgr):
        alloc = mgr.calculate_allocation(0)
        assert alloc.strategy_amount == 0.0
        assert alloc.fixed_amount == 0.0

    def test_sum_equals_total(self, mgr):
        total = 50_000_000
        alloc = mgr.calculate_allocation(total)
        assert alloc.strategy_amount + alloc.fixed_amount == pytest.approx(total)


class TestGetPerEtfAmount:
    def test_100_etfs(self, mgr):
        per = mgr.get_per_etf_amount(7_000_000, 100)
        assert per == pytest.approx(70_000)

    def test_zero_n(self, mgr):
        per = mgr.get_per_etf_amount(7_000_000, 0)
        assert per == 0.0


class TestGetQuantity:
    def test_normal(self, mgr):
        qty = mgr.get_quantity(70_000, 15_000)
        assert qty == 4  # 70000 // 15000 = 4

    def test_fractional_truncation(self, mgr):
        qty = mgr.get_quantity(70_000, 70_001)
        assert qty == 0  # 70000 // 70001 = 0

    def test_exact_division(self, mgr):
        qty = mgr.get_quantity(70_000, 10_000)
        assert qty == 7

    def test_zero_price(self, mgr):
        qty = mgr.get_quantity(70_000, 0)
        assert qty == 0
