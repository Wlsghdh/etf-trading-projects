"""Feature processing router for pipeline API."""
import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel

from app.services.processed_db_service import ProcessedDatabaseService

router = APIRouter()
logger = logging.getLogger(__name__)

# Global job state for tracking
_feature_job_status = {"status": "idle", "message": "", "progress": 0, "total": 0}


class FeatureProcessRequest(BaseModel):
    """Request model for feature processing."""
    symbols: Optional[List[str]] = None  # None = all symbols
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    include_macro: bool = True
    shift_features: bool = True


class FeatureProcessResponse(BaseModel):
    """Response for feature processing."""
    status: str
    message: str
    job_id: Optional[str] = None


class FeatureStatusResponse(BaseModel):
    """Response for feature processing status."""
    status: str
    message: str
    progress: int
    total: int


async def run_feature_processing(
    symbols: Optional[List[str]],
    start_date: str,
    end_date: str,
    include_macro: bool,
    shift_features: bool,
):
    """Background task to run feature processing."""
    global _feature_job_status

    try:
        _feature_job_status["status"] = "running"
        _feature_job_status["message"] = "Starting feature processing..."

        # Import here to avoid circular imports
        import sys
        from pathlib import Path

        # Make scraper-service root importable
        _scraper_root = str(Path(__file__).resolve().parent.parent.parent)
        if _scraper_root not in sys.path:
            sys.path.insert(0, _scraper_root)

        from app.features.data_providers.mysql_provider import MySQLProvider
        from app.features.pipeline import FeaturePipeline
        from app.features.ahnlab.constants import ALL_FEATURE_COLS

        # Get symbols if not provided
        if symbols is None:
            provider = MySQLProvider()
            symbols = provider.get_available_symbols()
            logger.info(f"Found {len(symbols)} symbols in etf2_db")

        _feature_job_status["total"] = len(symbols)
        _feature_job_status["message"] = f"Processing {len(symbols)} symbols..."

        # Build pipeline
        import os
        db_url = os.getenv("DB_URL", "mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db")
        pipeline = FeaturePipeline(
            data_provider="mysql",
            mysql_url=db_url,
            include_macro=include_macro,
            include_target=True,
            target_horizon=63,
        )

        panel = pipeline.create_panel(
            tickers=symbols,
            start_date=start_date,
            end_date=end_date,
            shift_features=shift_features,
            validate_features=True,
        )

        logger.info(
            f"Panel created: {panel.shape[0]:,} rows, "
            f"{panel['ticker'].nunique()} tickers"
        )

        # Connect to processed DB
        proc_db = ProcessedDatabaseService()
        try:
            proc_db.create_database()

            # Upsert per symbol
            unique_tickers = sorted(panel["ticker"].unique())
            total_rows = 0
            success = 0
            failed = 0

            for i, ticker in enumerate(unique_tickers, 1):
                try:
                    ticker_df = panel[panel["ticker"] == ticker]
                    rows = proc_db.upsert_dataframe(
                        ticker_df, ticker, timeframe="D", feature_cols=ALL_FEATURE_COLS
                    )
                    total_rows += rows
                    success += 1

                    # Update progress
                    _feature_job_status["progress"] = i
                    if i % 50 == 0 or i == len(unique_tickers):
                        logger.info(f"Progress: {i}/{len(unique_tickers)} symbols")
                        _feature_job_status["message"] = f"Processing {i}/{len(unique_tickers)} symbols..."
                except Exception as e:
                    logger.error(f"Failed to upsert {ticker}: {e}")
                    failed += 1

            _feature_job_status["status"] = "completed"
            _feature_job_status["message"] = (
                f"Completed: {success} symbols, {total_rows:,} rows upserted, {failed} failed"
            )
            logger.info(
                f"Feature processing done: {success} symbols, "
                f"{total_rows:,} rows upserted, {failed} failed"
            )
        finally:
            proc_db.close()

    except Exception as e:
        logger.error(f"Feature processing failed: {e}")
        _feature_job_status["status"] = "failed"
        _feature_job_status["message"] = f"Failed: {str(e)}"


@router.post("/process", response_model=FeatureProcessResponse)
async def start_feature_processing(
    request: FeatureProcessRequest,
    background_tasks: BackgroundTasks,
):
    """Start feature processing for all or specific symbols."""
    global _feature_job_status

    if _feature_job_status["status"] == "running":
        raise HTTPException(
            status_code=409,
            detail="Feature processing already running"
        )

    # Set defaults
    start_date = request.start_date or "2010-01-01"
    end_date = request.end_date or datetime.now().strftime("%Y-%m-%d")

    job_id = f"features_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    background_tasks.add_task(
        run_feature_processing,
        symbols=request.symbols,
        start_date=start_date,
        end_date=end_date,
        include_macro=request.include_macro,
        shift_features=request.shift_features,
    )

    # Initialize status
    _feature_job_status["status"] = "pending"
    _feature_job_status["message"] = "Feature processing started"
    _feature_job_status["progress"] = 0
    _feature_job_status["total"] = 0

    return FeatureProcessResponse(
        status="pending",
        message=f"Started feature processing (job_id: {job_id})",
        job_id=job_id
    )


@router.get("/status", response_model=FeatureStatusResponse)
async def get_feature_status():
    """Get current feature processing status."""
    return FeatureStatusResponse(
        status=_feature_job_status["status"],
        message=_feature_job_status["message"],
        progress=_feature_job_status["progress"],
        total=_feature_job_status["total"],
    )
