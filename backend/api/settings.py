from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

from core.state import state
from models.schemas import AgentConfig, AgentSettingsResponse

router = APIRouter(prefix="/settings", tags=["settings"])


class AgentSettingsUpdate(BaseModel):
    agents: List[AgentConfig]
    selected_agent_id: Optional[str] = None


@router.get("/agents", response_model=AgentSettingsResponse)
async def get_agent_settings():
    await state.refresh_agent_settings_from_storage()
    return state.get_agent_settings()


@router.put("/agents", response_model=AgentSettingsResponse)
async def put_agent_settings(payload: AgentSettingsUpdate):
    state.set_agent_settings(payload.agents, payload.selected_agent_id)
    # Persist immediately so caller gets strongly consistent response.
    await state._persist_agent_settings()
    await state.refresh_agent_settings_from_storage()
    return state.get_agent_settings()
