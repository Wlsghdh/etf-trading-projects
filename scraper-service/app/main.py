"""FastAPI application for scraper service."""
import logging
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, jobs, features, market_data

# Configure logging with date-based file handler
_log_dir = Path(settings.log_dir)
_log_dir.mkdir(parents=True, exist_ok=True)
_log_file = _log_dir / f"scraper_{datetime.now().strftime('%Y%m%d')}.log"

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(str(_log_file)),
    ],
)

app = FastAPI(
    title="ETF Scraper Service",
    description="TradingView data scraping service with async job management",
    version="1.0.0",
    root_path="/api/scraper"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
app.include_router(features.router, prefix="/features", tags=["Features"])
app.include_router(market_data.router, prefix="/market-data", tags=["Market Data"])


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logging.info("Scraper service starting up...")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logging.info("Scraper service shutting down...")
