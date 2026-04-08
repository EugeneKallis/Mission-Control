from fastapi import APIRouter
from typing import Optional
from models.schemas import JobSearchStats
from core.state import state
from datetime import datetime

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/today")
async def get_today_stats() -> Optional[JobSearchStats]:
    """Get today's job search stats."""
    return state.get_today_job_stats()


@router.post("/sync")
async def sync_job_stats(stats: JobSearchStats):
    """Sync job search stats from Hermes."""
    state.update_job_stats(stats)
    return {"status": "ok"}


@router.get("/history")
async def get_history(days: int = 30):
    """Get job search history."""
    # Return last N days of history
    return []
