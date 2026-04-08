from fastapi import APIRouter
from models.schemas import SystemStats
from core.state import state

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/stats", response_model=SystemStats)
async def get_system_stats():
    """Get current system resource usage."""
    return state.get_system_stats()
