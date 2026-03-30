from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.database import init_local_db
from app.routers import health, data, predictions, factsheet, db_viewer
from app.services.model_loader import get_model_loader

# 로깅 설정
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    # 시작 시
    logger.info("Initializing ETF Trading ML Service...")
    init_local_db()
    logger.info("Local database initialized")

    # Initialize ModelLoader (creates models directory if needed)
    try:
        model_loader = get_model_loader()
        available_models = model_loader.list_available_models()
        logger.info(f"ModelLoader initialized with {len(available_models)} available models")
        for m in available_models:
            logger.debug(f"  - {m.name} ({m.model_type})")

        # Load default ranking model
        try:
            model_loader.load_model(settings.default_model)
            logger.info(f"Default model loaded: {settings.default_model}")
        except FileNotFoundError:
            logger.warning(
                f"Default model {settings.default_model} not found. "
                f"Run scripts/train_ahnlab.py to train the model."
            )

        # Load price regressor model (optional)
        try:
            model_loader.load_regressor()
            logger.info("Price regressor model loaded")
        except FileNotFoundError:
            logger.info(
                "Price regressor model not found (optional). "
                "Run scripts/train_regressor.py to train."
            )
        except ImportError:
            logger.info("xgboost not installed, price regressor unavailable")
    except Exception as e:
        logger.warning(f"ModelLoader initialization failed: {e}")

    yield

    # 종료 시
    logger.info("Shutting down ETF Trading ML Service...")


app = FastAPI(
    title="ETF Trading ML Service",
    description="""
## ETF 트레이딩 데이터 파이프라인 API

AhnLab LightGBM LambdaRank 모델을 사용하여 전체 종목의
상대 순위 랭킹을 예측합니다.

### 주요 기능
- **랭킹 예측**: 전체 종목 상대 순위 예측 (85개 피처, 2-fold 앙상블)
- **데이터 조회**: 원격 DB에서 OHLCV + 기술적 지표 조회
- **저장**: 예측 결과를 로컬 SQLite에 저장
    """,
    version="1.0.0",
    lifespan=lifespan
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
app.include_router(health.router, tags=["Health"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Predictions"])
app.include_router(factsheet.router, prefix="/api/factsheet", tags=["Factsheet"])
app.include_router(db_viewer.router, prefix="/api/db", tags=["DB Viewer"])


@app.get("/")
def root():
    """API 루트"""
    return {
        "name": "ETF Trading ML Service",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }
