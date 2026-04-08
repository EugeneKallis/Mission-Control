from fastapi import APIRouter, HTTPException
from typing import List
from models.schemas import ProcessInfo
from core.state import state

router = APIRouter(prefix="/processes", tags=["processes"])


@router.get("/", response_model=List[ProcessInfo])
async def get_processes():
    """Get all running processes."""
    return state.get_processes()


@router.post("/sync")
async def sync_processes(processes: List[ProcessInfo]):
    """Sync process list from Hermes."""
    for proc in processes:
        state.update_process(proc)
    return {"status": "ok", "count": len(processes)}


@router.post("/{process_id}/kill")
async def kill_process(process_id: str):
    """Kill a running process."""
    # This will integrate with Hermes process tool
    return {"status": "killed", "process_id": process_id}
