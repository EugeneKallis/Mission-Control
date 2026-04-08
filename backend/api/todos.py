from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from models.schemas import TodoItem, TaskStatus
from core.state import state
from core.websocket import manager
import os

router = APIRouter(prefix="/todos", tags=["todos"])


class TodoUpdateInput(BaseModel):
    status: Optional[TaskStatus] = None
    assigned_agent: Optional[str] = None
    content: Optional[str] = None


class TodoCreateInput(BaseModel):
    content: str
    assigned_agent: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING


@router.get("/", response_model=List[TodoItem])
async def get_todos():
    """Get all current todos."""
    return state.get_todos()


@router.post("/sync")
async def sync_todos(todos: List[TodoItem]):
    """Sync todos from Hermes."""
    state.set_todos(todos)
    await manager.broadcast_state_change("state_update", state.get_full_state())
    return {"status": "ok", "count": len(todos)}


@router.post("/", response_model=TodoItem)
async def create_todo(payload: TodoCreateInput):
    """Create a new task for the Kanban board."""
    content = (payload.content or '').strip()
    if not content:
        raise HTTPException(status_code=400, detail='content is required')

    todo = state.create_todo(
        content,
        status=payload.status,
        assigned_agent=payload.assigned_agent,
    )
    await manager.broadcast_state_change("state_update", state.get_full_state())
    return todo


@router.patch("/{todo_id}", response_model=TodoItem)
async def update_todo(todo_id: str, payload: TodoUpdateInput):
    """Update a single task (status, assignment, or content)."""
    updated = state.update_todo(
        todo_id,
        status=payload.status,
        assigned_agent=payload.assigned_agent,
        content=payload.content,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Todo '{todo_id}' not found")

    await manager.broadcast_state_change("state_update", state.get_full_state())
    return updated


@router.get("/agents")
async def list_agents():
    """List available Hermes profile names for task assignment."""
    profiles_dir = os.path.expanduser("~/.hermes/profiles")
    agents = []

    if os.path.isdir(profiles_dir):
        for name in sorted(os.listdir(profiles_dir)):
            path = os.path.join(profiles_dir, name)
            if os.path.isdir(path) and not name.startswith('.'):
                agents.append(name)

    return {"agents": agents}
