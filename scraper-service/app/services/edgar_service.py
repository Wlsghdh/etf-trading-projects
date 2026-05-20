"""
SEC EDGAR 공시 데이터 수집 서비스

edgartools 라이브러리를 사용하여 10-K, 10-Q 공시 데이터를 수집하고
etf2_edgar DB에 저장합니다.

수집 항목:
- Filing 메타데이터 (filing_date, form, accession_no)
- XBRL 재무수치 (매출, 순이익, 총자산 등)
"""

import os
import logging
import json
from datetime import datetime, date
from typing import Optional, List
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

try:
    from edgar import Company, set_identity
    EDGAR_AVAILABLE = True
except ImportError:
    EDGAR_AVAILABLE = False
    logger.warning("edgartools not installed. SEC Edgar collection disabled.")

SEC_IDENTITY = os.environ.get("SEC_IDENTITY", "ETF-Project etf-project@example.com")
TARGET_FORMS = ["10-K", "10-Q"]


class EdgarService:
    """SEC EDGAR 공시 데이터 수집 및 DB 저장"""

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or os.getenv(
            "EDGAR_DB_URL",
            "mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_edgar",
        )
        self.engine = None
        self.Session = None
        self._job_status = {
            "status": "idle",
            "message": "",
            "progress": 0,
            "total": 0,
            "current_symbol": None,
            "errors": [],
        }

    def connect(self):
        self.engine = create_engine(
            self.db_url, pool_pre_ping=True, pool_recycle=3600, echo=False
        )
        self.Session = sessionmaker(bind=self.engine)
        # DB가 없으면 생성
        try:
            base_url = self.db_url.rsplit("/", 1)[0]
            tmp_engine = create_engine(base_url)
            with tmp_engine.connect() as conn:
                conn.execute(text("CREATE DATABASE IF NOT EXISTS etf2_edgar"))
                conn.commit()
            tmp_engine.dispose()
        except Exception as e:
            logger.warning(f"DB 생성 시도 중 오류 (이미 존재할 수 있음): {e}")
        # 연결 확인
        with self.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Edgar DB 연결 성공")

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
        """필요한 테이블 생성"""
        with self.engine.connect() as conn:
            # 공시 메타데이터 테이블
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS `edgar_filings` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `symbol` VARCHAR(32) NOT NULL,
                    `form` VARCHAR(16) NOT NULL,
                    `filing_date` DATE NOT NULL,
                    `accession_no` VARCHAR(64),
                    `period_of_report` DATE,
                    `company_name` VARCHAR(256),
                    `text_size_kb` DECIMAL(10,2),
                    `financials_size_kb` DECIMAL(10,2),
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `uq_symbol_form_date` (`symbol`, `form`, `filing_date`),
                    INDEX `idx_symbol` (`symbol`),
                    INDEX `idx_form` (`form`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))

            # XBRL 재무수치 테이블
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS `edgar_financials` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `symbol` VARCHAR(32) NOT NULL,
                    `form` VARCHAR(16) NOT NULL,
                    `filing_date` DATE NOT NULL,
                    `metric` VARCHAR(128) NOT NULL,
                    `value` DECIMAL(20,4),
                    `unit` VARCHAR(32),
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `uq_sym_form_date_metric` (`symbol`, `form`, `filing_date`, `metric`),
                    INDEX `idx_symbol` (`symbol`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))

            # 수집 로그 테이블
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS `edgar_collection_log` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `job_id` VARCHAR(64) NOT NULL,
                    `started_at` DATETIME,
                    `finished_at` DATETIME,
                    `status` VARCHAR(16),
                    `total_symbols` INT,
                    `success_count` INT DEFAULT 0,
                    `fail_count` INT DEFAULT 0,
                    `error_details` TEXT,
                    INDEX `idx_job_id` (`job_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))
            conn.commit()
        logger.info("Edgar 테이블 확인/생성 완료")

    def get_status(self) -> dict:
        return dict(self._job_status)

    def fetch_filing(self, symbol: str, form: str = "10-K") -> Optional[dict]:
        """단일 종목의 최신 공시 수집"""
        if not EDGAR_AVAILABLE:
            return None

        try:
            set_identity(SEC_IDENTITY)
            company = Company(symbol)
            try:
                filings = company.get_filings(form=form, amendments=False)
            except TypeError:
                filings = company.get_filings(form=form)
            if not filings:
                return None

            filing = filings.latest()

            result = {
                "symbol": symbol,
                "form": form,
                "filing_date": str(filing.filing_date) if hasattr(filing, "filing_date") else None,
                "accession_no": str(filing.accession_no) if hasattr(filing, "accession_no") else None,
                "company_name": str(filing.company) if hasattr(filing, "company") else None,
                "text_size_kb": 0,
                "financials": {},
            }

            # 텍스트 크기 측정
            try:
                text_content = filing.text()
                if text_content:
                    result["text_size_kb"] = round(len(text_content.encode("utf-8")) / 1024, 2)
            except Exception:
                pass

            # XBRL 재무수치 추출
            try:
                xbrl = filing.xbrl()
                if xbrl:
                    # 주요 재무 항목 추출 시도
                    for attr in ["income_statement", "balance_sheet", "cash_flow_statement"]:
                        try:
                            stmt = getattr(xbrl, attr, None)
                            if stmt is not None and hasattr(stmt, "to_dict"):
                                data = stmt.to_dict(orient="records") if hasattr(stmt, "to_dict") else {}
                                result["financials"][attr] = data
                        except Exception:
                            pass
            except Exception:
                pass

            return result
        except Exception as e:
            logger.error(f"Edgar fetch 실패 ({symbol} {form}): {e}")
            return None

    def store_filing(self, data: dict):
        """수집된 공시를 DB에 저장"""
        symbol = data["symbol"]
        form = data["form"]
        filing_date = data.get("filing_date")

        with self.get_session() as session:
            # 메타데이터 upsert
            session.execute(text("""
                INSERT INTO edgar_filings (symbol, form, filing_date, accession_no, company_name, text_size_kb)
                VALUES (:symbol, :form, :filing_date, :accession_no, :company_name, :text_size_kb)
                ON DUPLICATE KEY UPDATE
                    accession_no = VALUES(accession_no),
                    company_name = VALUES(company_name),
                    text_size_kb = VALUES(text_size_kb)
            """), {
                "symbol": symbol,
                "form": form,
                "filing_date": filing_date,
                "accession_no": data.get("accession_no"),
                "company_name": data.get("company_name"),
                "text_size_kb": data.get("text_size_kb", 0),
            })

    async def collect_all(self, symbols: List[str], forms: Optional[List[str]] = None):
        """전체 종목에 대해 공시 수집"""
        if not EDGAR_AVAILABLE:
            self._job_status = {"status": "error", "message": "edgartools not installed"}
            return

        forms = forms or TARGET_FORMS
        total = len(symbols) * len(forms)
        job_id = f"edgar_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        self._job_status = {
            "status": "running",
            "message": f"수집 시작: {len(symbols)}종목 × {len(forms)}종류",
            "progress": 0,
            "total": total,
            "current_symbol": None,
            "errors": [],
            "job_id": job_id,
        }

        self.connect()
        self.ensure_tables()

        # 로그 시작
        with self.get_session() as session:
            session.execute(text(
                "INSERT INTO edgar_collection_log (job_id, started_at, status, total_symbols) "
                "VALUES (:job_id, :started, 'running', :total)"
            ), {"job_id": job_id, "started": datetime.now(), "total": len(symbols)})

        success = 0
        fail = 0
        errors = []

        import asyncio
        set_identity(SEC_IDENTITY)

        for i, symbol in enumerate(symbols):
            for form in forms:
                self._job_status["current_symbol"] = symbol
                self._job_status["progress"] = i * len(forms) + forms.index(form)

                try:
                    data = self.fetch_filing(symbol, form)
                    if data and data.get("filing_date"):
                        self.store_filing(data)
                        success += 1
                        logger.info(f"[OK] {symbol} {form}: {data['filing_date']}")
                    else:
                        fail += 1
                        errors.append(f"{symbol}_{form}")
                        logger.warning(f"[SKIP] {symbol} {form}: 데이터 없음")
                except Exception as e:
                    fail += 1
                    errors.append(f"{symbol}_{form}")
                    logger.error(f"[ERROR] {symbol} {form}: {e}")

                # SEC rate limit (10 requests/second)
                await asyncio.sleep(0.15)

        # 로그 완료
        status = "completed" if fail == 0 else "partial" if success > 0 else "failed"
        with self.get_session() as session:
            session.execute(text(
                "UPDATE edgar_collection_log SET finished_at=:finished, status=:status, "
                "success_count=:success, fail_count=:fail, error_details=:errors "
                "WHERE job_id=:job_id"
            ), {
                "finished": datetime.now(),
                "status": status,
                "success": success,
                "fail": fail,
                "errors": ", ".join(errors[:50]) if errors else None,
                "job_id": job_id,
            })

        self._job_status = {
            "status": status,
            "message": f"완료: {success}개 성공, {fail}개 실패",
            "progress": total,
            "total": total,
            "current_symbol": None,
            "errors": errors,
            "job_id": job_id,
        }

        self.close()
        logger.info(f"Edgar 수집 완료: {success}/{total}")

    def get_recent_logs(self, limit: int = 5) -> list:
        """최근 수집 로그 조회"""
        try:
            self.connect()
            with self.engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT * FROM edgar_collection_log ORDER BY started_at DESC LIMIT :limit"
                ), {"limit": limit})
                logs = [dict(row._mapping) for row in result]
            self.close()
            return logs
        except Exception as e:
            logger.error(f"Edgar 로그 조회 실패: {e}")
            return []

    def get_filings_for_symbol(self, symbol: str) -> list:
        """특정 종목의 공시 목록 조회"""
        try:
            self.connect()
            with self.engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT * FROM edgar_filings WHERE symbol = :symbol ORDER BY filing_date DESC"
                ), {"symbol": symbol})
                filings = [dict(row._mapping) for row in result]
            self.close()
            return filings
        except Exception as e:
            logger.error(f"Edgar 공시 조회 실패 ({symbol}): {e}")
            return []
