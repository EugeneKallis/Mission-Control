from typing import Dict, List, Optional, Any
from datetime import datetime
from models.schemas import TodoItem, TaskStatus, CronJob, ProcessInfo, JobSearchStats, SystemStats, ActivityEvent
import json
import os
import asyncio
import aiosqlite
import psutil


class ActivityLog:
    """Rolling log of recent events, max 100 entries."""
    
    def __init__(self, max_size: int = 100):
        self.events: List[ActivityEvent] = []
        self.max_size = max_size
    
    def add(self, event_type: str, title: str, detail: str = None, status: str = "ok"):
        event = ActivityEvent(
            id=f"{datetime.now().timestamp()}",
            type=event_type,
            title=title,
            detail=detail,
            timestamp=datetime.now().isoformat(),
            status=status
        )
        self.events.insert(0, event)
        if len(self.events) > self.max_size:
            self.events = self.events[:self.max_size]
        return event


class DashboardState:
    """In-memory state manager with SQLite persistence for job history."""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init()
        return cls._instance
    
    def _init(self):
        self.todos: List[TodoItem] = []
        self.cron_jobs: List[CronJob] = []
        self.processes: Dict[str, ProcessInfo] = {}
        self.job_history: Dict[str, JobSearchStats] = {}
        self.activity_log = ActivityLog()
        self._subscribers: List[Any] = []
        self._db_path = os.path.expanduser("~/.hermes/mission-control/state.db")
        self._db = None
        self._db_init_started = False
        self._last_sys_poll = datetime.min
        self._cached_sys_stats: Optional[SystemStats] = None
    
    async def _ensure_db(self):
        """Lazily initialize DB on first async access."""
        if self._db is None and not self._db_init_started:
            self._db_init_started = True
            await self._init_db()
    
    async def _init_db(self):
        """Initialize SQLite database for job history."""
        os.makedirs(os.path.dirname(self._db_path), exist_ok=True)
        self._db = await aiosqlite.connect(self._db_path)
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS job_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE,
                roles_submitted INTEGER DEFAULT 0,
                roles_queued INTEGER DEFAULT 0,
                source_coverage TEXT DEFAULT '{}'
            )
        """)
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                type TEXT,
                title TEXT,
                detail TEXT,
                timestamp TEXT,
                status TEXT
            )
        """)
        await self._db.commit()
        await self._load_job_history()
        await self._load_activity()
    
    async def _load_job_history(self):
        await self._ensure_db()
        async with self._db.execute("SELECT date, roles_submitted, roles_queued, source_coverage FROM job_history") as cur:
            rows = await cur.fetchall()
            for row in rows:
                self.job_history[row[0]] = JobSearchStats(
                    date=row[0],
                    roles_submitted=row[1] or 0,
                    roles_queued=row[2] or 0,
                    source_coverage=json.loads(row[3] or '{}')
                )
    
    async def _load_activity(self):
        await self._ensure_db()
        async with self._db.execute("SELECT id, type, title, detail, timestamp, status FROM activity_log ORDER BY timestamp DESC LIMIT 100") as cur:
            rows = await cur.fetchall()
            self.activity_log.events = [
                ActivityEvent(id=r[0], type=r[1], title=r[2], detail=r[3], timestamp=r[4], status=r[5])
                for r in rows
            ]
    
    def subscribe(self, callback):
        self._subscribers.append(callback)
    
    def unsubscribe(self, callback):
        if callback in self._subscribers:
            self._subscribers.remove(callback)
    
    def _notify(self):
        for cb in self._subscribers:
            try:
                cb()
            except Exception:
                pass
    
    # ── Todos ─────────────────────────────────────────────────────────────────
    
    def set_todos(self, todos: List[TodoItem]):
        # Preserve local task metadata (like assigned_agent) across Hermes syncs.
        existing_by_id = {t.id: t for t in self.todos}
        merged: List[TodoItem] = []

        for todo in todos:
            current = existing_by_id.get(todo.id)
            if current and not todo.assigned_agent:
                todo.assigned_agent = current.assigned_agent
            merged.append(todo)

        self.todos = merged
        self._notify()
    
    def get_todos(self) -> List[TodoItem]:
        return self.todos

    def update_todo(self, todo_id: str, *, status: Optional[TaskStatus] = None, assigned_agent: Optional[str] = None, content: Optional[str] = None) -> Optional[TodoItem]:
        for todo in self.todos:
            if todo.id != todo_id:
                continue

            if status is not None:
                todo.status = status
                if status == "completed":
                    todo.completed_at = datetime.now()
                elif status != "completed":
                    todo.completed_at = None

            if assigned_agent is not None:
                todo.assigned_agent = assigned_agent.strip() or None

            if content is not None:
                todo.content = content

            self._notify()
            return todo

        return None
    
    # ── Cron Jobs ─────────────────────────────────────────────────────────────
    
    def set_cron_jobs(self, jobs: List[CronJob]):
        self.cron_jobs = jobs
        self._notify()
    
    def get_cron_jobs(self) -> List[CronJob]:
        return self.cron_jobs
    
    def load_crons_from_hermes(self):
        """Load cron jobs directly from Hermes's jobs.json file with full prompts."""
        hermes_file = os.path.expanduser("~/.hermes/cron/jobs.json")
        if not os.path.exists(hermes_file):
            return
        try:
            with open(hermes_file, 'r') as f:
                data = json.load(f)
            jobs = []
            for j in data.get("jobs", []):
                schedule = j.get("schedule", {})
                if isinstance(schedule, dict):
                    sched_expr = schedule.get("display", schedule.get("expr", ""))
                else:
                    sched_expr = str(schedule)
                repeat = j.get("repeat", {})
                repeat_times = repeat.get("completed", 0) if isinstance(repeat, dict) else 0
                jobs.append(CronJob(
                    id=j.get("id", ""),
                    name=j.get("name", "Unnamed"),
                    schedule=sched_expr,
                    deliver=j.get("deliver", "origin"),
                    enabled=j.get("enabled", True),
                    last_run=j.get("last_run_at"),
                    next_run=j.get("next_run_at"),
                    last_status=j.get("last_status", "unknown"),
                    state=j.get("state", "unknown"),
                    prompt_preview=j.get("prompt", ""),  # FULL prompt, not truncated
                    model=j.get("model"),
                    skills=j.get("skills", []),
                    provider=j.get("provider"),
                    base_url=j.get("base_url"),
                    repeat=f"{repeat_times} runs" if repeat_times else "forever",
                    paused_at=j.get("paused_at"),
                    paused_reason=j.get("paused_reason"),
                ))
            self.cron_jobs = jobs
            self._notify()
        except Exception as e:
            print(f"Error loading crons from Hermes: {e}")
    
    def toggle_cron_job(self, job_id: str, enabled: bool) -> bool:
        for job in self.cron_jobs:
            if job.id == job_id:
                job.enabled = enabled
                self._notify()
                return True
        return False
    
    def log_cron_run(self, job_name: str, status: str = "ok"):
        self.activity_log.add(
            event_type="cron_run",
            title=f"Ran: {job_name}",
            status=status,
            detail=f"Last status: {status}"
        )
        self._persist_activity()
        self._notify()
    
    # ── Processes ─────────────────────────────────────────────────────────────
    
    def update_process(self, proc: ProcessInfo):
        self.processes[proc.id] = proc
        self._notify()
    
    def remove_process(self, proc_id: str):
        if proc_id in self.processes:
            del self.processes[proc_id]
            self._notify()
    
    def get_processes(self) -> List[ProcessInfo]:
        return list(self.processes.values())
    
    # ── Job Search ────────────────────────────────────────────────────────────
    
    def update_job_stats(self, stats: JobSearchStats):
        self.job_history[stats.date] = stats
        self._persist_job_history()
        self._notify()
    
    def increment_jobs(self, date: str, count: int = 1, source: str = "unknown"):
        if date not in self.job_history:
            self.job_history[date] = JobSearchStats(date=date)
        
        s = self.job_history[date]
        s.roles_submitted += count
        s.source_coverage[source] = s.source_coverage.get(source, 0) + count
        self._persist_job_history()
        self._notify()
    
    def get_today_job_stats(self) -> Optional[JobSearchStats]:
        today = datetime.now().strftime("%Y-%m-%d")
        return self.job_history.get(today)
    
    async def _persist_job_history(self):
        if not self._db:
            return
        for date, stats in self.job_history.items():
            await self._db.execute("""
                INSERT INTO job_history (date, roles_submitted, roles_queued, source_coverage)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    roles_submitted=excluded.roles_submitted,
                    roles_queued=excluded.roles_queued,
                    source_coverage=excluded.source_coverage
            """, (date, stats.roles_submitted, stats.roles_queued, json.dumps(stats.source_coverage)))
        await self._db.commit()
    
    # ── Activity Log ──────────────────────────────────────────────────────────
    
    def _persist_activity(self):
        if not self._db:
            return
        import threading
        loop = asyncio.get_event_loop()
        asyncio.run_coroutine_threadsafe(self._persist_activity_async(), loop)
    
    async def _persist_activity_async(self):
        if not self._db:
            return
        for event in self.activity_log.events[:10]:
            await self._db.execute("""
                INSERT OR REPLACE INTO activity_log (id, type, title, detail, timestamp, status)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (event.id, event.type, event.title, event.detail, event.timestamp, event.status))
        await self._db.commit()
    
    # ── System Stats ──────────────────────────────────────────────────────────
    
    def get_system_stats(self) -> SystemStats:
        now = datetime.now()
        # Cache for 5 seconds
        if self._cached_sys_stats and (now - self._last_sys_poll).total_seconds() < 5:
            return self._cached_sys_stats
        
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime_hours = (now - boot_time).total_seconds() / 3600
        
        load = psutil.getloadavg() if hasattr(psutil, 'getloadavg') else [0.0, 0.0, 0.0]
        
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        self._cached_sys_stats = SystemStats(
            cpu_percent=psutil.cpu_percent(interval=None),  # non-blocking
            memory_percent=mem.percent,
            memory_used_gb=round(mem.used / (1024**3), 1),
            memory_total_gb=round(mem.total / (1024**3), 1),
            disk_percent=disk.percent,
            disk_used_tb=round(disk.used / (1024**4), 2),
            disk_total_tb=round(disk.total / (1024**4), 2),
            hostname=os.uname().nodename,
            uptime_hours=round(uptime_hours, 1),
            load_avg=[round(x, 2) for x in load]
        )
        self._last_sys_poll = now
        return self._cached_sys_stats
    
    # ── Full State ────────────────────────────────────────────────────────────
    
    def get_full_state(self) -> dict:
        return {
            "todos": [t.model_dump(mode='json') for t in self.todos],
            "cron_jobs": [j.model_dump(mode='json') for j in self.cron_jobs],
            "active_processes": [p.model_dump(mode='json') for p in self.processes.values()],
            "job_search_today": self.get_today_job_stats().model_dump(mode='json') if self.get_today_job_stats() else None,
            "system_stats": self.get_system_stats().model_dump(),
            "recent_activity": [e.model_dump(mode='json') for e in self.activity_log.events],
            "updated_at": datetime.now().isoformat()
        }


state = DashboardState()
