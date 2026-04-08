from fastapi import APIRouter, HTTPException
from typing import List
from models.schemas import CronJob
from core.state import state

router = APIRouter(prefix="/cron", tags=["cron"])


@router.get("/", response_model=List[CronJob])
async def get_cron_jobs():
    """Get all scheduled cron jobs."""
    return state.get_cron_jobs()


@router.post("/reload")
async def reload_cron_jobs():
    """Reload cron jobs directly from Hermes's jobs.json file."""
    state.load_crons_from_hermes()
    return {"status": "ok", "count": len(state.get_cron_jobs())}


@router.post("/sync")
async def sync_cron_jobs(jobs: List[CronJob]):
    """Sync cron jobs from Hermes."""
    state.set_cron_jobs(jobs)
    return {"status": "ok", "count": len(jobs)}


@router.post("/{job_id}/toggle")
async def toggle_job(job_id: str, enabled: bool):
    """Enable/disable a cron job."""
    if state.toggle_cron_job(job_id, enabled):
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Job not found")


@router.post("/{job_id}/run")
async def trigger_job(job_id: str):
    """Trigger a cron job to run immediately."""
    # This will integrate with Hermes cron tool
    return {"status": "triggered", "job_id": job_id}


@router.patch("/{job_id}")
async def update_cron_job(job_id: str, updates: dict):
    """Update a cron job's fields (e.g., prompt_preview)."""
    for job in state.cron_jobs:
        if job.id == job_id:
            for key, value in updates.items():
                if hasattr(job, key):
                    setattr(job, key, value)
            state._notify()
            return {"status": "ok", "job_id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")
