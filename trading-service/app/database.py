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
    """테이블 생성"""
    from app.models import TradingCycle, DailyPurchase, OrderLog  # noqa
    Base.metadata.create_all(bind=engine)
