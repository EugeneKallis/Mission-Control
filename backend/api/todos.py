from fastapi import APIRouter, HTTPException
from typing import List
from models.schemas import TodoItem
from core.state import state

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("/", response_model=List[TodoItem])
async def get_todos():
    """Get all current todos."""
    return state.get_todos()


@router.post("/sync")
async def sync_todos(todos: List[TodoItem]):
    """Sync todos from Hermes."""
    state.set_todos(todos)
    return {"status": "ok", "count": len(todos)}
