"""SEC Edgar collection router."""
import logging
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel

from app.services.edgar_service import EdgarService, EDGAR_AVAILABLE
from config.symbol_loader import STOCK_LIST

router = APIRouter(prefix="/edgar", tags=["edgar"])
logger = logging.getLogger(__name__)

edgar_service = EdgarService()


class EdgarCollectRequest(BaseModel):
    symbols: Optional[List[str]] = None
    forms: Optional[List[str]] = None


@router.get("/status")
async def get_status():
    """Get Edgar collection status."""
    status = edgar_service.get_status()
    status["available"] = EDGAR_AVAILABLE
    return status


@router.post("/collect")
async def start_collection(
    request: EdgarCollectRequest,
    background_tasks: BackgroundTasks,
):
    """Start Edgar filing collection."""
    if not EDGAR_AVAILABLE:
        return {"status": "error", "message": "edgartools not installed"}

    if edgar_service.get_status().get("status") == "running":
        return {"status": "error", "message": "Collection already running"}

    symbols = request.symbols or STOCK_LIST[:50]  # 기본: 상위 50종목
    forms = request.forms or ["10-K", "10-Q"]

    background_tasks.add_task(edgar_service.collect_all, symbols, forms)

    return {
        "status": "pending",
        "message": f"Started Edgar collection: {len(symbols)} symbols × {len(forms)} forms",
        "total": len(symbols) * len(forms),
    }


@router.get("/logs")
async def get_logs(limit: int = Query(default=5)):
    """Get recent Edgar collection logs."""
    logs = edgar_service.get_recent_logs(limit)
    return {"logs": logs}


@router.get("/filings/{symbol}")
async def get_filings(symbol: str):
    """Get filings for a specific symbol."""
    filings = edgar_service.get_filings_for_symbol(symbol.upper())
    return {"symbol": symbol.upper(), "filings": filings, "count": len(filings)}
