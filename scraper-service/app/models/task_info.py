"""Task information models and JSON state management."""
import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    """Job status enumeration."""
    IDLE = "idle"
    RUNNING = "running"
    PARTIAL = "partial"
    COMPLETED = "completed"
    STOPPED = "stopped"
    ERROR = "error"


class SymbolStatus(str, Enum):
    """Symbol processing status."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    UPLOADING = "uploading"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


class TimeframeStatus(str, Enum):
    """Timeframe processing status."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    SUCCESS = "success"
    FAILED = "failed"


class TimeframeInfo(BaseModel):
    """Information about a single timeframe."""
    status: TimeframeStatus = TimeframeStatus.PENDING
    rows: int = 0
    error: Optional[str] = None
    downloaded_at: Optional[str] = None
    uploaded_at: Optional[str] = None


class SymbolInfo(BaseModel):
    """Information about a single symbol."""
    symbol: str
    status: SymbolStatus = SymbolStatus.PENDING
    timeframes: Dict[str, TimeframeInfo] = Field(default_factory=lambda: {
        "12달": TimeframeInfo(),
        "1달": TimeframeInfo(),
        "1주": TimeframeInfo(),
        "1일": TimeframeInfo(),
    })
    error: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class RetryTask(BaseModel):
    """Information about a retry task."""
    retry_id: str
    parent_job_id: str
    symbols: List[str]
    status: JobStatus = JobStatus.IDLE
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class JobInfo(BaseModel):
    """Complete job information."""
    job_id: str
    status: JobStatus = JobStatus.IDLE
    symbols: Dict[str, SymbolInfo] = Field(default_factory=dict)
    current_symbol: Optional[str] = None
    current_timeframe: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_downloaded: int = 0
    total_uploaded: int = 0
    total_rows: int = 0
    retry_tasks: List[RetryTask] = Field(default_factory=list)


class TaskInfoManager:
    """Manages task information with JSON file persistence."""

    def __init__(self, filepath: str = "/app/logs/task_info.json"):
        """Initialize task info manager.

        Args:
            filepath: Path to JSON state file
        """
        self.filepath = Path(filepath)
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._job_info: Optional[JobInfo] = None

    async def load(self) -> JobInfo:
        """Load job info from file.

        Returns:
            JobInfo object
        """
        async with self._lock:
            if self.filepath.exists():
                try:
                    data = json.loads(self.filepath.read_text())
                    self._job_info = JobInfo(**data)
                except Exception:
                    self._job_info = JobInfo(job_id="initial")
            else:
                self._job_info = JobInfo(job_id="initial")
            return self._job_info

    async def save(self) -> None:
        """Save job info to file."""
        async with self._lock:
            if self._job_info:
                self.filepath.write_text(
                    self._job_info.model_dump_json(indent=2)
                )

    async def get_job_info(self, reload: bool = True) -> JobInfo:
        """Get current job info.

        Args:
            reload: If True, reload from file to get latest state from background tasks

        Returns:
            JobInfo object
        """
        if reload or self._job_info is None:
            await self.load()
        return self._job_info

    async def update_job_status(self, status: JobStatus) -> None:
        """Update job status.

        Args:
            status: New job status
        """
        job_info = await self.get_job_info()
        job_info.status = status

        if status == JobStatus.RUNNING and job_info.start_time is None:
            job_info.start_time = datetime.utcnow().isoformat()
        elif status in [JobStatus.COMPLETED, JobStatus.STOPPED, JobStatus.ERROR]:
            job_info.end_time = datetime.utcnow().isoformat()

        await self.save()

    async def update_symbol_status(
        self,
        symbol: str,
        status: SymbolStatus,
        **kwargs
    ) -> None:
        """Update symbol status.

        Args:
            symbol: Symbol ticker
            status: New symbol status
            **kwargs: Additional fields to update
        """
        job_info = await self.get_job_info()

        if symbol not in job_info.symbols:
            job_info.symbols[symbol] = SymbolInfo(symbol=symbol)

        symbol_info = job_info.symbols[symbol]
        symbol_info.status = status

        for key, value in kwargs.items():
            if hasattr(symbol_info, key):
                setattr(symbol_info, key, value)

        if status == SymbolStatus.DOWNLOADING and symbol_info.start_time is None:
            symbol_info.start_time = datetime.utcnow().isoformat()
        elif status in [SymbolStatus.COMPLETED, SymbolStatus.FAILED]:
            symbol_info.end_time = datetime.utcnow().isoformat()

        await self.save()

    async def update_timeframe_status(
        self,
        symbol: str,
        timeframe: str,
        status: TimeframeStatus,
        rows: int = 0,
        error: Optional[str] = None
    ) -> None:
        """Update timeframe status for a symbol.

        Args:
            symbol: Symbol ticker
            timeframe: Timeframe code (12달, 1달, 1주, 1일)
            status: New timeframe status
            rows: Number of rows uploaded
            error: Error message if failed
        """
        job_info = await self.get_job_info()

        if symbol not in job_info.symbols:
            job_info.symbols[symbol] = SymbolInfo(symbol=symbol)

        symbol_info = job_info.symbols[symbol]

        if timeframe not in symbol_info.timeframes:
            symbol_info.timeframes[timeframe] = TimeframeInfo()

        tf_info = symbol_info.timeframes[timeframe]
        tf_info.status = status

        now = datetime.utcnow().isoformat()

        if status == TimeframeStatus.DOWNLOADING:
            tf_info.downloaded_at = now
        elif status == TimeframeStatus.SUCCESS:
            tf_info.uploaded_at = now
            tf_info.rows = rows
            job_info.total_downloaded += 1
            job_info.total_uploaded += 1
            job_info.total_rows += rows
        elif status == TimeframeStatus.FAILED:
            tf_info.error = error

        # Update current timeframe
        job_info.current_timeframe = timeframe

        # Recalculate symbol status based on timeframes
        await self._recalculate_symbol_status(symbol)
        await self.save()

    async def _recalculate_symbol_status(self, symbol: str) -> None:
        """Recalculate symbol status based on timeframe statuses."""
        job_info = await self.get_job_info()
        symbol_info = job_info.symbols.get(symbol)

        if not symbol_info:
            return

        statuses = [tf.status for tf in symbol_info.timeframes.values()]

        all_success = all(s == TimeframeStatus.SUCCESS for s in statuses)
        any_success = any(s == TimeframeStatus.SUCCESS for s in statuses)
        any_failed = any(s == TimeframeStatus.FAILED for s in statuses)
        any_pending = any(s == TimeframeStatus.PENDING for s in statuses)
        any_downloading = any(s == TimeframeStatus.DOWNLOADING for s in statuses)

        if all_success:
            symbol_info.status = SymbolStatus.COMPLETED
            symbol_info.end_time = datetime.utcnow().isoformat()
        elif any_downloading:
            symbol_info.status = SymbolStatus.DOWNLOADING
        elif any_failed and any_success:
            symbol_info.status = SymbolStatus.PARTIAL
            symbol_info.end_time = datetime.utcnow().isoformat()
        elif any_failed and not any_success:
            symbol_info.status = SymbolStatus.FAILED
            symbol_info.end_time = datetime.utcnow().isoformat()
        elif any_pending:
            symbol_info.status = SymbolStatus.PENDING

    async def set_current_symbol(self, symbol: Optional[str]) -> None:
        """Set currently processing symbol.

        Args:
            symbol: Symbol ticker or None
        """
        job_info = await self.get_job_info()
        job_info.current_symbol = symbol
        await self.save()

    async def initialize_job(self, job_id: str, symbols: List[str]) -> None:
        """Initialize a new job.

        Args:
            job_id: Unique job identifier
            symbols: List of symbols to process
        """
        self._job_info = JobInfo(
            job_id=job_id,
            status=JobStatus.RUNNING,
            symbols={
                sym: SymbolInfo(symbol=sym)
                for sym in symbols
            },
            start_time=datetime.utcnow().isoformat()
        )
        await self.save()

    async def get_failed_symbols(self) -> List[str]:
        """Get list of failed symbols.

        Returns:
            List of symbol tickers
        """
        job_info = await self.get_job_info()
        return [
            sym_info.symbol
            for sym_info in job_info.symbols.values()
            if sym_info.status == SymbolStatus.FAILED
        ]

    async def get_completed_count(self) -> int:
        """Get count of completed symbols.

        Returns:
            Number of completed symbols
        """
        job_info = await self.get_job_info()
        return sum(
            1 for sym_info in job_info.symbols.values()
            if sym_info.status == SymbolStatus.COMPLETED
        )

    async def reset(self) -> None:
        """Reset to initial state."""
        self._job_info = JobInfo(job_id="initial")
        await self.save()

    async def start_retry_task(self, symbols: List[str]) -> str:
        """Start a retry task for specific symbols.

        This preserves the main job state and only retries the specified symbols.

        Args:
            symbols: List of symbols to retry

        Returns:
            retry_id for the new retry task
        """
        job_info = await self.get_job_info()

        retry_id = f"retry_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        retry_task = RetryTask(
            retry_id=retry_id,
            parent_job_id=job_info.job_id,
            symbols=symbols,
            status=JobStatus.RUNNING,
            start_time=datetime.utcnow().isoformat()
        )

        job_info.retry_tasks.append(retry_task)

        # Reset status for symbols being retried
        for symbol in symbols:
            if symbol in job_info.symbols:
                symbol_info = job_info.symbols[symbol]
                symbol_info.status = SymbolStatus.PENDING
                symbol_info.error = None
                symbol_info.start_time = None
                symbol_info.end_time = None
                # Reset all timeframes
                for tf in symbol_info.timeframes.values():
                    tf.status = TimeframeStatus.PENDING
                    tf.rows = 0
                    tf.error = None
                    tf.downloaded_at = None
                    tf.uploaded_at = None
            else:
                job_info.symbols[symbol] = SymbolInfo(symbol=symbol)

        # Update main job status to running
        job_info.status = JobStatus.RUNNING

        await self.save()
        return retry_id

    async def complete_retry_task(self, retry_id: str, status: JobStatus) -> None:
        """Mark a retry task as complete.

        Args:
            retry_id: The retry task ID
            status: Final status (COMPLETED, PARTIAL, FAILED)
        """
        job_info = await self.get_job_info()

        for retry_task in job_info.retry_tasks:
            if retry_task.retry_id == retry_id:
                retry_task.status = status
                retry_task.end_time = datetime.utcnow().isoformat()
                break

        # Recalculate main job status based on all symbols
        completed = sum(1 for s in job_info.symbols.values() if s.status == SymbolStatus.COMPLETED)
        total = len(job_info.symbols)

        if completed == total:
            job_info.status = JobStatus.COMPLETED
        elif completed > 0:
            job_info.status = JobStatus.PARTIAL
        else:
            job_info.status = JobStatus.ERROR

        job_info.end_time = datetime.utcnow().isoformat()

        await self.save()

    async def get_active_retry_task(self) -> Optional[RetryTask]:
        """Get the currently running retry task, if any.

        Returns:
            Active RetryTask or None
        """
        job_info = await self.get_job_info()

        for retry_task in job_info.retry_tasks:
            if retry_task.status == JobStatus.RUNNING:
                return retry_task

        return None


# Global instance
task_info_manager = TaskInfoManager()
