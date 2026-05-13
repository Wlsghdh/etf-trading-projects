"""
시장 데이터 수집 및 DB 저장 서비스

매일 07시에 실행되어 환율, 지수, 원자재, 금리 등 시장 데이터를
etf2_market_data 데이터베이스에 날짜별로 저장합니다.

데이터 소스:
- Yahoo Finance: S&P500, NASDAQ, DOW, VIX, Gold, Bitcoin, Crude Oil, Dollar Index
- FRED API: Federal Funds Rate, 10Y Treasury
- Open Exchange Rates: USD/KRW
"""

import os
import logging
from datetime import datetime, date
from typing import Optional
from contextlib import contextmanager

import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

FRED_API_KEY = os.getenv("FRED_API_KEY", "9caba366c8bc71e8fea23b45a34651a5")

# 수집 대상 Yahoo Finance 심볼
YAHOO_SYMBOLS = {
    "sp500": "^GSPC",
    "nasdaq": "^IXIC",
    "dow": "^DJI",
    "vix": "^VIX",
    "gold": "GC=F",
    "bitcoin": "BTC-USD",
    "crude_oil": "CL=F",
    "dollar_index": "DX-Y.NYB",
}

# FRED 시리즈
FRED_SERIES = {
    "fed_rate": "FEDFUNDS",
    "treasury_10y": "DGS10",
}


class MarketDataService:
    """시장 데이터 수집 및 DB 저장"""

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or os.getenv(
            "MARKET_DB_URL",
            "mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_market_data",
        )
        self.engine = None
        self.Session = None

    def connect(self):
        self.engine = create_engine(
            self.db_url, pool_pre_ping=True, pool_recycle=3600, echo=False
        )
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("MarketData DB 연결 성공")

    def close(self):
        if self.engine:
            self.engine.dispose()
            self.engine = None

    @contextmanager
    def get_session(self):
        session = self.Session()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def ensure_tables(self):
        """필요한 테이블 자동 생성"""
        with self.engine.connect() as conn:
            # 메인 시장 데이터 테이블
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS market_daily (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    date DATE NOT NULL,
                    metric VARCHAR(50) NOT NULL,
                    value DOUBLE,
                    change_pct DOUBLE,
                    extra_label VARCHAR(100),
                    source VARCHAR(50),
                    collected_at DATETIME NOT NULL,
                    UNIQUE KEY uq_date_metric (date, metric)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))
            # 수집 로그 테이블
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS market_collection_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    job_id VARCHAR(50) NOT NULL,
                    started_at DATETIME NOT NULL,
                    finished_at DATETIME,
                    status VARCHAR(20) NOT NULL DEFAULT 'running',
                    total_metrics INT DEFAULT 0,
                    success_count INT DEFAULT 0,
                    fail_count INT DEFAULT 0,
                    error_details TEXT,
                    UNIQUE KEY uq_job_id (job_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))
            conn.commit()
        logger.info("market_daily, market_collection_log 테이블 확인/생성 완료")

    def _fetch_yahoo(self, symbol: str) -> Optional[dict]:
        """Yahoo Finance에서 현재가 + 변동률 가져오기"""
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
            resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            data = resp.json()
            result = data["chart"]["result"][0]
            meta = result["meta"]
            price = meta["regularMarketPrice"]
            prev = meta.get("previousClose") or meta.get("chartPreviousClose") or price
            change_pct = ((price - prev) / prev) * 100 if prev else 0
            return {"value": price, "change_pct": round(change_pct, 4)}
        except Exception as e:
            logger.error(f"Yahoo Finance 조회 실패 ({symbol}): {e}")
            return None

    def _fetch_fred(self, series_id: str) -> Optional[float]:
        """FRED API에서 최신 값 가져오기"""
        try:
            url = (
                f"https://api.stlouisfed.org/fred/series/observations"
                f"?series_id={series_id}&api_key={FRED_API_KEY}"
                f"&file_type=json&sort_order=desc&limit=1"
            )
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            val = float(data["observations"][0]["value"])
            return val
        except Exception as e:
            logger.error(f"FRED 조회 실패 ({series_id}): {e}")
            return None

    def _fetch_exchange_rate(self) -> Optional[dict]:
        """USD/KRW 환율 가져오기"""
        try:
            resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
            resp.raise_for_status()
            data = resp.json()
            krw = data["rates"]["KRW"]
            return {"value": krw, "change_pct": 0}
        except Exception as e:
            logger.error(f"환율 조회 실패: {e}")
            return None

    def _vix_label(self, v: float) -> str:
        if v < 12:
            return "Extreme Greed"
        if v < 20:
            return "Low Fear"
        if v < 30:
            return "Moderate Fear"
        if v < 40:
            return "High Fear"
        return "Extreme Fear"

    def collect_and_store(self, target_date: Optional[date] = None) -> dict:
        """
        전체 시장 데이터를 수집하여 DB에 저장

        Returns:
            {"job_id": str, "success": int, "fail": int, "errors": [...]}
        """
        target_date = target_date or date.today()
        job_id = f"market_{target_date.strftime('%Y%m%d')}_{datetime.now().strftime('%H%M%S')}"
        started_at = datetime.now()
        errors = []
        success = 0
        fail = 0

        self.connect()
        self.ensure_tables()

        # 로그 시작
        with self.get_session() as session:
            session.execute(
                text(
                    "INSERT INTO market_collection_log (job_id, started_at, status) "
                    "VALUES (:job_id, :started_at, 'running')"
                ),
                {"job_id": job_id, "started_at": started_at},
            )

        collected_at = datetime.now()

        # 1. Yahoo Finance 데이터
        for metric, symbol in YAHOO_SYMBOLS.items():
            result = self._fetch_yahoo(symbol)
            if result:
                extra = self._vix_label(result["value"]) if metric == "vix" else None
                self._upsert(target_date, metric, result["value"], result["change_pct"], extra, "yahoo", collected_at)
                success += 1
                logger.info(f"[OK] {metric}: {result['value']} ({result['change_pct']:+.2f}%)")
            else:
                fail += 1
                errors.append(f"{metric} ({symbol})")

        # 2. FRED 데이터
        for metric, series_id in FRED_SERIES.items():
            val = self._fetch_fred(series_id)
            if val is not None:
                self._upsert(target_date, metric, val, None, None, "fred", collected_at)
                success += 1
                logger.info(f"[OK] {metric}: {val}")
            else:
                fail += 1
                errors.append(f"{metric} ({series_id})")

        # 3. 환율
        exr = self._fetch_exchange_rate()
        if exr:
            self._upsert(target_date, "usd_krw", exr["value"], exr["change_pct"], None, "open_er_api", collected_at)
            success += 1
            logger.info(f"[OK] usd_krw: {exr['value']}")
        else:
            fail += 1
            errors.append("usd_krw")

        # 로그 완료
        status = "completed" if fail == 0 else "partial" if success > 0 else "failed"
        with self.get_session() as session:
            session.execute(
                text(
                    "UPDATE market_collection_log SET finished_at=:finished, status=:status, "
                    "total_metrics=:total, success_count=:success, fail_count=:fail, "
                    "error_details=:errors WHERE job_id=:job_id"
                ),
                {
                    "finished": datetime.now(),
                    "status": status,
                    "total": success + fail,
                    "success": success,
                    "fail": fail,
                    "errors": ", ".join(errors) if errors else None,
                    "job_id": job_id,
                },
            )

        self.close()
        logger.info(f"시장 데이터 수집 완료: {success}개 성공, {fail}개 실패")
        return {"job_id": job_id, "status": status, "success": success, "fail": fail, "errors": errors}

    def _upsert(self, dt: date, metric: str, value: float, change_pct: Optional[float],
                extra: Optional[str], source: str, collected_at: datetime):
        """UPSERT: 같은 날짜+metric이면 업데이트, 없으면 INSERT"""
        with self.get_session() as session:
            session.execute(
                text("""
                    INSERT INTO market_daily (date, metric, value, change_pct, extra_label, source, collected_at)
                    VALUES (:date, :metric, :value, :change_pct, :extra, :source, :collected_at)
                    ON DUPLICATE KEY UPDATE
                        value = VALUES(value),
                        change_pct = VALUES(change_pct),
                        extra_label = VALUES(extra_label),
                        source = VALUES(source),
                        collected_at = VALUES(collected_at)
                """),
                {
                    "date": dt,
                    "metric": metric,
                    "value": value,
                    "change_pct": change_pct,
                    "extra": extra,
                    "source": source,
                    "collected_at": collected_at,
                },
            )

    def get_latest(self, days: int = 30) -> list[dict]:
        """최근 N일간 시장 데이터 조회"""
        self.connect()
        try:
            with self.get_session() as session:
                result = session.execute(
                    text("""
                        SELECT date, metric, value, change_pct, extra_label, source, collected_at
                        FROM market_daily
                        WHERE date >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
                        ORDER BY date DESC, metric ASC
                    """),
                    {"days": days},
                )
                rows = [dict(r._mapping) for r in result]
                return rows
        finally:
            self.close()

    def get_logs(self, limit: int = 20) -> list[dict]:
        """수집 로그 조회"""
        self.connect()
        try:
            with self.get_session() as session:
                result = session.execute(
                    text("""
                        SELECT job_id, started_at, finished_at, status,
                               total_metrics, success_count, fail_count, error_details
                        FROM market_collection_log
                        ORDER BY started_at DESC
                        LIMIT :limit
                    """),
                    {"limit": limit},
                )
                rows = [dict(r._mapping) for r in result]
                return rows
        finally:
            self.close()
