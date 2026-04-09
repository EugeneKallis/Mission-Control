from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from core.state import state
from core.websocket import manager
import asyncio

router = APIRouter(prefix="/hermes", tags=["hermes"])


class HermesTodoInput(BaseModel):
    id: str
    content: str
    status: str
    created_at: str
    completed_at: Optional[str] = None


class HermesCronInput(BaseModel):
    job_id: str
    name: str
    schedule: str
    deliver: str
    enabled: bool
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    last_status: Optional[str] = None
    state: str = "unknown"
    prompt_preview: Optional[str] = None
    model: Optional[str] = None


class HermesProcessInput(BaseModel):
    session_id: str
    command: str
    status: str
    started_at: str
    pid: Optional[int] = None


class HermesJobStatsInput(BaseModel):
    date: Optional[str] = None
    roles_submitted: int = 0
    roles_queued: int = 0
    source_coverage: dict = {}


class HermesSyncInput(BaseModel):
    todos: List[HermesTodoInput] = []
    cron_jobs: List[HermesCronInput] = []
    processes: List[HermesProcessInput] = []
    job_stats: Optional[HermesJobStatsInput] = None


@router.post("/sync")
async def sync_hermes(data: HermesSyncInput):
    """Sync all data from Hermes agent in one call."""
    results = {"synced": {}}
    
    # Sync todos
    if data.todos is not None:
        from models.schemas import TodoItem, TaskStatus
        formatted = []
        for t in data.todos:
            try:
                ts = TaskStatus(t.status)
            except ValueError:
                ts = TaskStatus.PENDING
            formatted.append(TodoItem(
                id=t.id,
                content=t.content,
                status=ts,
                created_at=datetime.fromisoformat(t.created_at.replace('Z', '+00:00')),
                completed_at=datetime.fromisoformat(t.completed_at.replace('Z', '+00:00')) if t.completed_at else None,
                assigned_agent=getattr(t, 'assigned_agent', None),
                pr_required=bool(getattr(t, 'pr_required', False)),
                pr_link=getattr(t, 'pr_link', None),
            ))
        state.set_todos(formatted)
        results["synced"]["todos"] = len(formatted)
    
    # Sync cron jobs
    if data.cron_jobs is not None:
        from models.schemas import CronJob
        formatted = [
            CronJob(
                id=j.job_id,
                name=j.name,
                schedule=j.schedule,
                deliver=j.deliver,
                enabled=j.enabled,
                last_run=j.last_run_at,
                next_run=j.next_run_at,
                last_status=j.last_status or "unknown",
                state=j.state,
                prompt_preview=j.prompt_preview,
                model=j.model
            )
            for j in data.cron_jobs
        ]
        state.set_cron_jobs(formatted)
        results["synced"]["cron_jobs"] = len(formatted)
    
    # Sync processes
    if data.processes is not None:
        from models.schemas import ProcessInfo
        for p in data.processes:
            started = datetime.fromisoformat(p.started_at.replace('Z', '+00:00'))
            state.update_process(ProcessInfo(
                id=p.session_id,
                command=p.command,
                status=p.status,
                started_at=started,
                pid=p.pid
            ))
        results["synced"]["processes"] = len(data.processes)
    
    # Sync job stats
    if data.job_stats is not None:
        from models.schemas import JobSearchStats
        date = data.job_stats.date or datetime.now().strftime("%Y-%m-%d")
        stats = JobSearchStats(
            date=date,
            roles_submitted=data.job_stats.roles_submitted,
            roles_queued=data.job_stats.roles_queued,
            source_coverage=data.job_stats.source_coverage or {}
        )
        state.update_job_stats(stats)
        results["synced"]["job_stats"] = True
    
    # Broadcast update to all WebSocket clients
    await manager.broadcast_state_change("hermes_sync", state.get_full_state())
    results["synced"]["websocket_broadcast"] = True
    
    return {"status": "ok", **results}


@router.post("/cron-run")
async def log_cron_run(job_name: str, status: str = "ok"):
    """Log that a cron job just ran (called from Hermes after each cron execution)."""
    state.log_cron_run(job_name, status)
    await manager.broadcast_state_change("activity_update")
    return {"status": "logged"}


@router.post("/increment-jobs")
async def increment_jobs(count: int = 1, source: str = "manual", date: Optional[str] = None):
    """Increment job submission count."""
    d = date or datetime.now().strftime("%Y-%m-%d")
    state.increment_jobs(d, count, source)
    await manager.broadcast_state_change("job_update")
    return {"status": "ok", "date": d, "count": count}
