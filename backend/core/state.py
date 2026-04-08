from typing import Dict, List, Optional, Any
from datetime import datetime
from models.schemas import TodoItem, TaskStatus, CronJob, ProcessInfo, JobSearchStats, SystemStats, ActivityEvent, AgentConfig
import json
import os
import asyncio
import asyncpg
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
    """In-memory state manager with PostgreSQL-backed persistence for todos/activity/job history."""
    
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
        self.agent_configs: List[AgentConfig] = []
        self.selected_agent_id: Optional[str] = None
        self._subscribers: List[Any] = []
        self._db = None
        self._db_init_started = False
        self._db_url = os.getenv("DATABASE_URL", "").strip()
        if not self._db_url:
            pg_host = os.getenv("POSTGRES_HOST") or os.getenv("PGHOST")
            pg_port = os.getenv("POSTGRES_PORT") or os.getenv("PGPORT") or "5432"
            pg_db = os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE")
            pg_user = os.getenv("POSTGRES_USER") or os.getenv("PGUSER")
            pg_password = os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or ""
            if pg_host and pg_db and pg_user:
                self._db_url = f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}"

        self._last_sys_poll = datetime.min
        self._cached_sys_stats: Optional[SystemStats] = None

    async def _ensure_db(self):
        """Lazily initialize DB on first async access."""
        if self._db is None and not self._db_init_started:
            self._db_init_started = True
            await self._init_db()

    async def initialize_storage(self):
        await self._ensure_db()

    async def _init_db(self):
        """Initialize PostgreSQL persistence."""
        if not self._db_url:
            print("Mission Control DB: DATABASE_URL not set; running in-memory mode.")
            return

        try:
            print("Mission Control DB: connecting to PostgreSQL...")
            self._db = await asyncpg.create_pool(self._db_url, min_size=1, max_size=5)

            async with self._db.acquire() as conn:
                db_name = await conn.fetchval("SELECT current_database()")
                db_user = await conn.fetchval("SELECT current_user")
                db_version = await conn.fetchval("SHOW server_version")
                print(f"Mission Control DB: connected to '{db_name}' as '{db_user}' (Postgres {db_version})")

                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS todos (
                        id TEXT PRIMARY KEY,
                        content TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL,
                        completed_at TIMESTAMPTZ NULL,
                        assigned_agent TEXT NULL
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS job_history (
                        date TEXT PRIMARY KEY,
                        roles_submitted INTEGER DEFAULT 0,
                        roles_queued INTEGER DEFAULT 0,
                        source_coverage JSONB DEFAULT '{}'::jsonb
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS activity_log (
                        id TEXT PRIMARY KEY,
                        type TEXT,
                        title TEXT,
                        detail TEXT,
                        timestamp TEXT,
                        status TEXT
                    )
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value JSONB NOT NULL
                    )
                """)

            await self._load_todos()
            await self._load_job_history()
            await self._load_activity()
            await self._load_agent_settings()
            print(f"Mission Control DB: bootstrapped tables and loaded state (todos={len(self.todos)}, activity={len(self.activity_log.events)})")
        except Exception as e:
            print(f"Mission Control DB: connection/init failed: {e}")
            raise
    
    async def _load_todos(self):
        await self._ensure_db()
        if not self._db:
            return

        async with self._db.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, content, status, created_at, completed_at, assigned_agent FROM todos ORDER BY created_at DESC"
            )

        self.todos = [
            TodoItem(
                id=r["id"],
                content=r["content"],
                status=r["status"],
                created_at=r["created_at"],
                completed_at=r["completed_at"],
                assigned_agent=r["assigned_agent"],
            )
            for r in rows
        ]

    async def refresh_todos_from_storage(self):
        await self._load_todos()

    async def _load_job_history(self):
        await self._ensure_db()
        if not self._db:
            return

        async with self._db.acquire() as conn:
            rows = await conn.fetch("SELECT date, roles_submitted, roles_queued, source_coverage FROM job_history")

        for row in rows:
            self.job_history[row["date"]] = JobSearchStats(
                date=row["date"],
                roles_submitted=row["roles_submitted"] or 0,
                roles_queued=row["roles_queued"] or 0,
                source_coverage=dict(row["source_coverage"] or {}),
            )
    
    async def _load_activity(self):
        await self._ensure_db()
        if not self._db:
            return

        async with self._db.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, type, title, detail, timestamp, status FROM activity_log ORDER BY timestamp DESC LIMIT 100"
            )

        self.activity_log.events = [
            ActivityEvent(
                id=r["id"],
                type=r["type"],
                title=r["title"],
                detail=r["detail"],
                timestamp=r["timestamp"],
                status=r["status"],
            )
            for r in rows
        ]
    
    async def _load_agent_settings(self):
        await self._ensure_db()
        if not self._db:
            return

        async with self._db.acquire() as conn:
            payload = await conn.fetchval("SELECT value FROM app_settings WHERE key = 'agent_settings'")

        if not payload:
            self.agent_configs = []
            self.selected_agent_id = None
            return

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                print("Mission Control DB: invalid app_settings JSON payload for agent_settings")
                payload = {}

        agents = payload.get("agents") if isinstance(payload, dict) else []
        selected = payload.get("selected_agent_id") if isinstance(payload, dict) else None

        self.agent_configs = [
            AgentConfig(
                id=str(a.get("id", "")).strip(),
                name=str(a.get("name", "")).strip(),
                url=str(a.get("url", "")).strip().rstrip('/'),
            )
            for a in (agents or [])
            if isinstance(a, dict) and str(a.get("id", "")).strip() and str(a.get("name", "")).strip() and str(a.get("url", "")).strip()
        ]

        selected_id = str(selected).strip() if selected is not None else None
        valid_ids = {a.id for a in self.agent_configs}
        self.selected_agent_id = selected_id if selected_id in valid_ids else (self.agent_configs[0].id if self.agent_configs else None)

    async def _persist_agent_settings(self):
        if not self._db:
            return

        payload = {
            "agents": [a.model_dump(mode='json') for a in self.agent_configs],
            "selected_agent_id": self.selected_agent_id,
        }

        async with self._db.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_settings (key, value)
                VALUES ('agent_settings', $1::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                json.dumps(payload),
            )

    async def refresh_agent_settings_from_storage(self):
        await self._load_agent_settings()

    def get_agent_settings(self) -> dict:
        return {
            "agents": [a.model_dump(mode='json') for a in self.agent_configs],
            "selected_agent_id": self.selected_agent_id,
        }

    def set_agent_settings(self, agents: List[AgentConfig], selected_agent_id: Optional[str] = None):
        self.agent_configs = agents
        valid_ids = {a.id for a in agents}
        selected = (selected_agent_id or '').strip() or None
        self.selected_agent_id = selected if selected in valid_ids else (agents[0].id if agents else None)
        self._schedule(self._persist_agent_settings())
        self._notify()

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

    def _schedule(self, coro):
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # No running loop (e.g., startup import path). Skip async persistence.
            pass

    async def _persist_todo(self, todo: TodoItem):
        if not self._db:
            return
        async with self._db.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO todos (id, content, status, created_at, completed_at, assigned_agent)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    content = EXCLUDED.content,
                    status = EXCLUDED.status,
                    created_at = EXCLUDED.created_at,
                    completed_at = EXCLUDED.completed_at,
                    assigned_agent = EXCLUDED.assigned_agent
                """,
                todo.id,
                todo.content,
                todo.status,
                todo.created_at,
                todo.completed_at,
                todo.assigned_agent,
            )

    async def _persist_all_todos(self):
        if not self._db:
            return
        async with self._db.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM todos")
                for todo in self.todos:
                    await conn.execute(
                        """
                        INSERT INTO todos (id, content, status, created_at, completed_at, assigned_agent)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        todo.id,
                        todo.content,
                        todo.status,
                        todo.created_at,
                        todo.completed_at,
                        todo.assigned_agent,
                    )

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
        self._schedule(self._persist_all_todos())
        self._notify()
    
    def get_todos(self) -> List[TodoItem]:
        return self.todos

    def create_todo(self, content: str, *, status: TaskStatus = TaskStatus.PENDING, assigned_agent: Optional[str] = None) -> TodoItem:
        import uuid

        todo = TodoItem(
            id=uuid.uuid4().hex[:12],
            content=content.strip(),
            status=status,
            created_at=datetime.now(),
            completed_at=datetime.now() if status == TaskStatus.COMPLETED else None,
            assigned_agent=(assigned_agent or '').strip() or None,
        )
        self.todos.append(todo)
        self._schedule(self._persist_todo(todo))
        self._notify()
        return todo

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

            self._schedule(self._persist_todo(todo))
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
        self._schedule(self._persist_job_history())
        self._notify()
    
    def increment_jobs(self, date: str, count: int = 1, source: str = "unknown"):
        if date not in self.job_history:
            self.job_history[date] = JobSearchStats(date=date)
        
        s = self.job_history[date]
        s.roles_submitted += count
        s.source_coverage[source] = s.source_coverage.get(source, 0) + count
        self._schedule(self._persist_job_history())
        self._notify()
    
    def get_today_job_stats(self) -> Optional[JobSearchStats]:
        today = datetime.now().strftime("%Y-%m-%d")
        return self.job_history.get(today)
    
    async def _persist_job_history(self):
        if not self._db:
            return
        async with self._db.acquire() as conn:
            async with conn.transaction():
                for date, stats in self.job_history.items():
                    await conn.execute(
                        """
                        INSERT INTO job_history (date, roles_submitted, roles_queued, source_coverage)
                        VALUES ($1, $2, $3, $4::jsonb)
                        ON CONFLICT(date) DO UPDATE SET
                            roles_submitted = EXCLUDED.roles_submitted,
                            roles_queued = EXCLUDED.roles_queued,
                            source_coverage = EXCLUDED.source_coverage
                        """,
                        date,
                        stats.roles_submitted,
                        stats.roles_queued,
                        json.dumps(stats.source_coverage),
                    )
    
    # ── Activity Log ──────────────────────────────────────────────────────────
    
    def _persist_activity(self):
        self._schedule(self._persist_activity_async())

    async def _persist_activity_async(self):
        if not self._db:
            return

        async with self._db.acquire() as conn:
            async with conn.transaction():
                for event in self.activity_log.events[:100]:
                    await conn.execute(
                        """
                        INSERT INTO activity_log (id, type, title, detail, timestamp, status)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO UPDATE SET
                            type = EXCLUDED.type,
                            title = EXCLUDED.title,
                            detail = EXCLUDED.detail,
                            timestamp = EXCLUDED.timestamp,
                            status = EXCLUDED.status
                        """,
                        event.id,
                        event.type,
                        event.title,
                        event.detail,
                        event.timestamp,
                        event.status,
                    )
    
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
