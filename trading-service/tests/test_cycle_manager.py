import pytest
from datetime import date
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import TradingCycle, DailyPurchase
from app.services.cycle_manager import CycleManager


@pytest.fixture
def db_session():
    """테스트용 인메모리 SQLite 세션"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def mgr():
    return CycleManager()


class TestGetOrCreateActiveCycle:
    def test_create_new_when_none(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, initial_capital=10_000_000)
        assert cycle.id is not None
        assert cycle.is_active is True
        assert cycle.initial_capital == 10_000_000
        assert cycle.strategy_capital == pytest.approx(7_000_000)
        assert cycle.fixed_capital == pytest.approx(3_000_000)

    def test_return_existing(self, db_session, mgr):
        c1 = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        c2 = mgr.get_or_create_active_cycle(db_session, 20_000_000)
        assert c1.id == c2.id  # 기존 사이클 반환


class TestGetPurchasesToSell:
    def test_no_sell_before_64(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        # day 63 이하에서는 매도 대상 없음
        for day in range(1, 64):
            result = mgr.get_purchases_to_sell(db_session, cycle.id, day)
            assert len(result) == 0

    def test_sell_day_1_on_day_64(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        # Day 1에 매수 기록
        mgr.record_purchases(db_session, cycle.id, 1, [
            {"etf_code": "069500", "quantity": 10, "price": 50000},
            {"etf_code": "229200", "quantity": 5, "price": 30000},
        ])
        # Day 64에서 Day 1 매수분 조회
        to_sell = mgr.get_purchases_to_sell(db_session, cycle.id, 64)
        assert len(to_sell) == 2

    def test_sell_day_2_on_day_65(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        mgr.record_purchases(db_session, cycle.id, 1, [
            {"etf_code": "069500", "quantity": 10, "price": 50000},
        ])
        mgr.record_purchases(db_session, cycle.id, 2, [
            {"etf_code": "229200", "quantity": 5, "price": 30000},
        ])
        # Day 65에서는 Day 2 매수분만
        to_sell = mgr.get_purchases_to_sell(db_session, cycle.id, 65)
        assert len(to_sell) == 1
        assert to_sell[0].etf_code == "229200"


class TestMarkAsSold:
    def test_mark_sold(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        purchases = mgr.record_purchases(db_session, cycle.id, 1, [
            {"etf_code": "069500", "quantity": 10, "price": 50000},
        ])
        purchase_ids = [p.id for p in purchases]
        mgr.mark_as_sold(db_session, purchase_ids, 55000, date.today())

        # 재조회
        updated = db_session.query(DailyPurchase).filter(
            DailyPurchase.id == purchase_ids[0]
        ).first()
        assert updated.sold is True
        assert updated.sold_price == 55000
        assert updated.sell_pnl == (55000 - 50000) * 10  # 50,000 이익


class TestCreateNewCycle:
    def test_deactivates_old(self, db_session, mgr):
        c1 = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        assert c1.is_active is True

        c2 = mgr.create_new_cycle(db_session, 20_000_000)
        assert c2.is_active is True
        assert c2.id != c1.id

        # 기존 사이클 비활성 확인
        db_session.refresh(c1)
        assert c1.is_active is False


class TestGetUnsoldPurchases:
    def test_filters_sold(self, db_session, mgr):
        cycle = mgr.get_or_create_active_cycle(db_session, 10_000_000)
        purchases = mgr.record_purchases(db_session, cycle.id, 1, [
            {"etf_code": "069500", "quantity": 10, "price": 50000},
            {"etf_code": "229200", "quantity": 5, "price": 30000},
        ])
        # 하나만 매도 처리
        mgr.mark_as_sold(db_session, [purchases[0].id], 55000, date.today())

        unsold = mgr.get_unsold_purchases(db_session, cycle.id)
        assert len(unsold) == 1
        assert unsold[0].etf_code == "229200"
