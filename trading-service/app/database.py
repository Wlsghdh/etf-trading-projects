from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings
import os

# Local SQLite Engine
os.makedirs(os.path.dirname(settings.local_db_path), exist_ok=True)
engine = create_engine(
    f"sqlite:///{settings.local_db_path}",
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """DB 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """테이블 생성 + 마이그레이션"""
    from app.models import TradingCycle, DailyPurchase, OrderLog, TradingLog  # noqa
    Base.metadata.create_all(bind=engine)

    # 마이그레이션: order_logs에 limit_price 컬럼 추가
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    if "order_logs" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("order_logs")]
        if "limit_price" not in cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE order_logs ADD COLUMN limit_price FLOAT"))
                conn.commit()
