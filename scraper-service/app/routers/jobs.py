"""Job management router."""
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.config import settings
from app.models.task_info import task_info_manager, JobStatus, SymbolStatus
from app.services.scraper import scraper, STOCK_LIST
from app.services.db_service import DatabaseService

router = APIRouter()
logger = logging.getLogger(__name__)


class JobResponse(BaseModel):
    """Response for job creation."""
    job_id: str
    status: str
    message: str


class JobStatusResponse(BaseModel):
    """Response model for job status."""
    job_id: Optional[str] = None
    status: str
    progress: dict
    current_symbol: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class RetryRequest(BaseModel):
    """Request model for retrying failed symbols."""
    symbols: List[str]


async def run_scraping_job(symbols: List[str], is_retry: bool = False, job_id: str = None):
    """Background task to run scraping job."""
    try:
        async with scraper:
            scraper.job_id = job_id
            await scraper.process_all_stocks(symbols, is_retry=is_retry)
    except Exception as e:
        logger.error(f"Scraping job failed: {e}")
        await task_info_manager.update_job_status(JobStatus.ERROR)


@router.post("/full", response_model=JobResponse)
async def start_full_job(background_tasks: BackgroundTasks):
    """Start a full scraping job for all symbols."""
    job_info = await task_info_manager.get_job_info()

    if job_info.status == JobStatus.RUNNING:
        raise HTTPException(
            status_code=409,
            detail=f"Job already running: {job_info.job_id}"
        )

    job_id = f"full_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # job 초기화는 process_all_stocks 내부에서 수행됨
    background_tasks.add_task(run_scraping_job, STOCK_LIST, False, job_id)

    return JobResponse(
        job_id=job_id,
        status="pending",
        message=f"Started full scraping job for {len(STOCK_LIST)} symbols"
    )


@router.post("/retry", response_model=JobResponse)
async def retry_symbols(request: RetryRequest, background_tasks: BackgroundTasks):
    """Retry scraping for specific symbols. Preserves main job state."""
    job_info = await task_info_manager.get_job_info()

    if job_info.status == JobStatus.RUNNING:
        raise HTTPException(
            status_code=409,
            detail=f"Job already running: {job_info.job_id}"
        )

    # Validate symbols
    valid_symbols = [s for s in request.symbols if s in STOCK_LIST]
    if not valid_symbols:
        raise HTTPException(
            status_code=400,
            detail="No valid symbols provided"
        )

    # Start retry task (preserves main job state)
    background_tasks.add_task(run_scraping_job, valid_symbols, True)

    return JobResponse(
        job_id=f"retry_{len(valid_symbols)}_symbols",
        status="pending",
        message=f"Started retry job for {len(valid_symbols)} symbols: {', '.join(valid_symbols)}"
    )


@router.get("/status", response_model=JobStatusResponse)
async def get_status():
    """Get current job status."""
    job_info = await task_info_manager.get_job_info()

    # task_info 기반 카운트
    completed = sum(1 for s in job_info.symbols.values() if s.status == SymbolStatus.COMPLETED)
    failed = sum(1 for s in job_info.symbols.values() if s.status == SymbolStatus.FAILED)
    total = len(job_info.symbols) or 101

    # job_id가 없으면 DB에서 최근 job 가져오기, completed도 DB 기반으로 재계산
    job_id = job_info.job_id if job_info.job_id != "initial" else None
    try:
        from sqlalchemy import create_engine, text
        import os
        db_url = os.getenv("DB_URL", "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db")
        engine = create_engine(db_url)
        with engine.connect() as conn:
            if not job_id:
                result = conn.execute(text(
                    "SELECT job_id FROM scraping_logs ORDER BY id DESC LIMIT 1"
                ))
                row = result.fetchone()
                if row:
                    job_id = row[0]

            if job_id and completed == 0:
                result2 = conn.execute(text(
                    "SELECT COUNT(DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(message, ' to ', -1), '_', 1)) "
                    "FROM scraping_logs WHERE job_id = :job_id AND message LIKE :pattern"
                ), {"job_id": job_id, "pattern": "Uploaded % rows to %"})
                completed = result2.scalar() or 0
        engine.dispose()
    except Exception:
        pass

    # 완료 후 상태 보정
    status_value = job_info.status.value
    if completed > 0 and status_value == "error" and job_info.end_time:
        status_value = "completed" if completed >= total else "partial"

    error_symbols = [s.symbol for s in job_info.symbols.values() if s.status == SymbolStatus.FAILED]

    return JobStatusResponse(
        job_id=job_id,
        status=status_value,
        progress={
            "current": completed,
            "total": total,
            "current_symbol": job_info.current_symbol,
            "errors": error_symbols
        },
        current_symbol=job_info.current_symbol,
        start_time=job_info.start_time,
        end_time=job_info.end_time
    )


@router.post("/cancel")
async def cancel_job():
    """Cancel the current running job."""
    job_info = await task_info_manager.get_job_info()

    if job_info.status != JobStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail="No job is currently running"
        )

    await task_info_manager.update_job_status(JobStatus.STOPPED)

    return {"message": "Job cancelled", "job_id": job_info.job_id}


@router.get("/logs")
async def get_logs(
    limit: int = Query(100, description="Maximum number of log entries to return"),
    job_id: str = Query(None, description="Filter by job ID"),
    symbol: str = Query(None, description="Filter by symbol"),
    level: str = Query(None, description="Filter by log level (DEBUG, INFO, WARNING, ERROR)"),
    min_level: str = Query(None, description="Minimum log level (INFO = INFO, WARNING, ERROR)"),
):
    """
    Get scraping log entries from database.

    Returns logs from scraping_logs table with optional filters.
    """
    db_service = None
    try:
        db_service = DatabaseService()
        db_service.connect()

        # Build query
        query = """
            SELECT id, job_id, timestamp, level, symbol, timeframe, message
            FROM scraping_logs
            WHERE 1=1
        """
        params = {}

        if job_id:
            query += " AND job_id = :job_id"
            params["job_id"] = job_id

        if symbol:
            query += " AND symbol = :symbol"
            params["symbol"] = symbol

        if level:
            query += " AND level = :level"
            params["level"] = level

        if min_level:
            # Map level names to numeric values for comparison
            level_order = {"DEBUG": 1, "INFO": 2, "WARNING": 3, "ERROR": 4, "CRITICAL": 5}
            min_val = level_order.get(min_level.upper(), 2)
            query += f" AND FIELD(level, 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL') >= {min_val}"

        query += " ORDER BY timestamp DESC LIMIT :limit"
        params["limit"] = limit

        with db_service.engine.connect() as conn:
            result = conn.execute(text(query), params)
            rows = result.fetchall()

        logs = [
            {
                "id": row.id,
                "job_id": row.job_id,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
                "level": row.level,
                "symbol": row.symbol,
                "timeframe": row.timeframe,
                "message": row.message,
            }
            for row in rows
        ]

        return {
            "logs": logs,
            "count": len(logs),
            "limit": limit,
            "filters": {
                "job_id": job_id,
                "symbol": symbol,
                "level": level,
                "min_level": min_level,
            }
        }

    except Exception as e:
        logger.error(f"Failed to query logs from DB: {e}")
        return {"logs": [], "error": str(e)}
    finally:
        if db_service:
            db_service.close()


@router.get("/jobs")
async def list_jobs(
    limit: int = Query(10, description="Maximum number of jobs to return"),
):
    """
    List recent scraping jobs based on log entries.

    Returns distinct job_ids with their timestamp range and log count.
    """
    db_service = None
    try:
        db_service = DatabaseService()
        db_service.connect()

        query = """
            SELECT
                job_id,
                MIN(timestamp) as start_time,
                MAX(timestamp) as end_time,
                COUNT(*) as log_count,
                SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as error_count
            FROM scraping_logs
            GROUP BY job_id
            ORDER BY start_time DESC
            LIMIT :limit
        """

        with db_service.engine.connect() as conn:
            result = conn.execute(text(query), {"limit": limit})
            rows = result.fetchall()

        jobs = [
            {
                "job_id": row.job_id,
                "start_time": row.start_time.isoformat() if row.start_time else None,
                "end_time": row.end_time.isoformat() if row.end_time else None,
                "log_count": row.log_count,
                "error_count": row.error_count,
            }
            for row in rows
        ]

        return {"jobs": jobs, "count": len(jobs)}

    except Exception as e:
        logger.error(f"Failed to query jobs from DB: {e}")
        return {"jobs": [], "error": str(e)}
    finally:
        if db_service:
            db_service.close()
