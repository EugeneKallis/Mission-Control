from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TodoItem(BaseModel):
    id: str
    content: str
    status: TaskStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    assigned_agent: Optional[str] = None


class CronJob(BaseModel):
    id: str
    name: str
    schedule: str
    deliver: str
    enabled: bool
    last_run: Optional[str] = None
    next_run: Optional[str] = None
    last_status: str = "unknown"
    state: str = "unknown"
    prompt_preview: Optional[str] = None
    model: Optional[str] = None
    skills: Optional[List[str]] = []
    provider: Optional[str] = None
    base_url: Optional[str] = None
    repeat: Optional[str] = None
    paused_at: Optional[str] = None
    paused_reason: Optional[str] = None


class ProcessInfo(BaseModel):
    id: str
    command: str
    status: str
    started_at: datetime
    pid: Optional[int] = None


class JobSearchStats(BaseModel):
    date: str
    roles_submitted: int = 0
    roles_queued: int = 0
    source_coverage: Dict[str, int] = {}


class SystemStats(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_percent: float
    disk_used_tb: float
    disk_total_tb: float
    hostname: str
    uptime_hours: float
    load_avg: List[float]


class ActivityEvent(BaseModel):
    id: str
    type: str  # "cron_run", "todo_change", "process_change", "job_submitted"
    title: str
    detail: Optional[str] = None
    timestamp: str
    status: str = "ok"  # "ok", "error", "info"


class AgentConfig(BaseModel):
    id: str
    name: str
    url: str


class AgentSettingsResponse(BaseModel):
    agents: List[AgentConfig]
    selected_agent_id: Optional[str] = None


class DashboardStateResponse(BaseModel):
    todos: List[TodoItem]
    cron_jobs: List[CronJob]
    active_processes: List[ProcessInfo]
    job_search_today: Optional[JobSearchStats]
    system_stats: Optional[SystemStats]
    recent_activity: List[ActivityEvent]
    updated_at: str
