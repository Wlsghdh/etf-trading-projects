"""시장 데이터 수집 API 라우터"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)
router = APIRouter()

# 진행 중인 작업 상태
_current_job: Optional[dict] = None


def _run_collection(target_date: Optional[date] = None):
    """백그라운드에서 시장 데이터 수집 실행"""
    global _current_job
    try:
        svc = MarketDataService()
        result = svc.collect_and_store(target_date)
        _current_job = result
    except Exception as e:
        logger.error(f"시장 데이터 수집 오류: {e}")
        _current_job = {"status": "failed", "error": str(e)}


@router.post("/collect")
async def collect_market_data(background_tasks: BackgroundTasks, target_date: Optional[str] = None):
    """시장 데이터 수집 시작 (백그라운드)"""
    dt = None
    if target_date:
        try:
            dt = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(400, f"Invalid date format: {target_date}. Use YYYY-MM-DD")

    global _current_job
    _current_job = {"status": "running"}
    background_tasks.add_task(_run_collection, dt)
    return {"message": "시장 데이터 수집 시작", "target_date": str(dt or date.today())}


@router.get("/status")
async def get_collection_status():
    """현재 수집 작업 상태"""
    return _current_job or {"status": "idle"}


@router.get("/data")
async def get_market_data(days: int = 30):
    """최근 N일간 시장 데이터 조회"""
    try:
        svc = MarketDataService()
        rows = svc.get_latest(days)
        # date별로 그룹핑
        grouped = {}
        for row in rows:
            d = str(row["date"])
            if d not in grouped:
                grouped[d] = {"date": d, "metrics": {}}
            grouped[d]["metrics"][row["metric"]] = {
                "value": row["value"],
                "change_pct": row["change_pct"],
                "extra_label": row["extra_label"],
                "source": row["source"],
            }
        return {"data": list(grouped.values()), "total_days": len(grouped)}
    except Exception as e:
        logger.error(f"시장 데이터 조회 오류: {e}")
        raise HTTPException(500, str(e))


@router.get("/logs")
async def get_collection_logs(limit: int = 20):
    """수집 로그 목록"""
    try:
        svc = MarketDataService()
        logs = svc.get_logs(limit)
        # datetime을 string으로 변환
        for log in logs:
            for key in ["started_at", "finished_at"]:
                if log.get(key):
                    log[key] = str(log[key])
        return {"logs": logs}
    except Exception as e:
        logger.error(f"수집 로그 조회 오류: {e}")
        raise HTTPException(500, str(e))
