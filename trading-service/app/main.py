from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from app.config import settings
from app.database import init_db

# 타임존 KST 설정
os.environ["TZ"] = "Asia/Seoul"
try:
    import time as _time
    _time.tzset()
except AttributeError:
    pass

# 로깅 설정 (KST)
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s [KST] - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    logger.info("Initializing ETF Trading Service...")
    init_db()
    logger.info(f"Database initialized: {settings.local_db_path}")
    logger.info(f"Trading mode: {settings.trading_mode}")

    # APScheduler 설정
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        from app.services.trade_executor import execute_daily_trading

        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            execute_daily_trading,
            CronTrigger(
                hour=settings.trade_hour_kst,
                minute=settings.trade_minute_kst,
                timezone="Asia/Seoul",
            ),
            id="daily_trading",
            name="일일 자동매매",
            replace_existing=True,
        )
        scheduler.start()
        logger.info(
            f"스케줄러 시작: 매일 {settings.trade_hour_kst:02d}:{settings.trade_minute_kst:02d} KST"
        )
    except Exception as e:
        logger.warning(f"스케줄러 초기화 실패 (수동 실행만 가능): {e}")

    yield

    # 종료 시
    logger.info("Shutting down ETF Trading Service...")
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass


app = FastAPI(
    title="ETF Trading Service",
    description="""
## ETF 자동매매 서비스

KIS API를 통해 63일 FIFO 순환매매 전략을 자동 실행합니다.

### 주요 기능
- **자동 매매**: ml-service 랭킹 기반 상위 ETF 매수/매도
- **FIFO 순환**: 63거래일 후 자동 매도 → 재매수
- **포트폴리오**: 보유 내역 및 거래 이력 조회
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
from app.routers import health, trading, history  # noqa

app.include_router(health.router, tags=["Health"])
app.include_router(trading.router, tags=["Trading"])
app.include_router(history.router, tags=["History"])


@app.get("/")
def root():
    return {
        "name": "ETF Trading Service",
        "version": "1.0.0",
        "trading_mode": settings.trading_mode,
        "docs": "/docs",
        "health": "/health",
    }
