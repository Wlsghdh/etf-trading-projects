from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, Date, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class TradingCycle(Base):
    """사이클 상태 관리"""
    __tablename__ = "trading_cycles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cycle_start_date = Column(Date, nullable=False)
    current_day_number = Column(Integer, nullable=False, default=1)
    initial_capital = Column(Float, nullable=False)
    strategy_capital = Column(Float, nullable=False)
    fixed_capital = Column(Float, nullable=False)
    trading_mode = Column(String(10), nullable=False, default="paper")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    purchases = relationship("DailyPurchase", back_populates="cycle", cascade="all, delete-orphan")
    order_logs = relationship("OrderLog", back_populates="cycle", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<TradingCycle id={self.id} day={self.current_day_number} active={self.is_active}>"


class DailyPurchase(Base):
    """FIFO 매수 추적"""
    __tablename__ = "daily_purchases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cycle_id = Column(Integer, ForeignKey("trading_cycles.id"), nullable=False)
    trading_day_number = Column(Integer, nullable=False)
    purchase_date = Column(Date, nullable=False)
    etf_code = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False)  # 소수점 매매 지원
    price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    sold = Column(Boolean, default=False)
    sold_date = Column(Date, nullable=True)
    sold_price = Column(Float, nullable=True)
    sell_pnl = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cycle = relationship("TradingCycle", back_populates="purchases")

    __table_args__ = (
        UniqueConstraint("cycle_id", "trading_day_number", "etf_code", name="uix_cycle_day_etf"),
    )

    def __repr__(self):
        return f"<DailyPurchase day={self.trading_day_number} {self.etf_code} qty={self.quantity}>"


class OrderLog(Base):
    """주문 감사 로그"""
    __tablename__ = "order_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cycle_id = Column(Integer, ForeignKey("trading_cycles.id"), nullable=True)
    order_type = Column(String(10), nullable=False)  # BUY / SELL
    etf_code = Column(String(20), nullable=False)
    quantity = Column(Float, nullable=False)  # 소수점 매매 지원
    price = Column(Float, nullable=True)
    order_id = Column(String(50), nullable=True)  # KIS 주문번호
    status = Column(String(20), nullable=False, default="PENDING")  # SUCCESS / FAILED / PENDING
    error_message = Column(String(500), nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    cycle = relationship("TradingCycle", back_populates="order_logs")

    def __repr__(self):
        return f"<OrderLog {self.order_type} {self.etf_code} {self.status}>"


class DailySnapshot(Base):
    """일일 포트폴리오 스냅샷 (날짜별 수익률 추적)"""
    __tablename__ = "daily_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, unique=True)
    cycle_id = Column(Integer, nullable=True)
    total_invested = Column(Float, nullable=False, default=0)      # 총 매수 금액
    total_current_value = Column(Float, nullable=False, default=0) # 현재 평가 금액
    total_pnl = Column(Float, nullable=False, default=0)           # 총 손익
    total_pnl_percent = Column(Float, nullable=False, default=0)   # 수익률 %
    available_cash = Column(Float, nullable=False, default=0)      # 주문 가능 금액
    holdings_count = Column(Integer, nullable=False, default=0)    # 보유 종목 수
    day_buy_count = Column(Integer, nullable=False, default=0)     # 당일 매수 건수
    day_sell_count = Column(Integer, nullable=False, default=0)    # 당일 매도 건수
    holdings_detail = Column(String(5000), nullable=True)          # JSON: 종목별 상세
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<DailySnapshot {self.snapshot_date} pnl={self.total_pnl_percent:.2f}%>"
