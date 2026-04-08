# Mission Control Dashboard

Real-time web dashboard for monitoring Hermes Agent — tasks, cron jobs, system resources, job search, and activity feed.

**Live:** `http://32.220.220.207:5175` (or `http://localhost:5175` locally)  
**API:** `http://localhost:5056`

---

## Features

| Widget | Description |
|--------|-------------|
| **Tasks** | Live todo list with status badges (pending / in-progress / completed) |
| **Cron Jobs** | All scheduled jobs with next/last run times and status |
| **Processes** | Active background processes |
| **System Stats** | CPU, memory, disk usage with live progress bars |
| **Job Search** | Daily submission count with source breakdown |
| **Activity Feed** | Rolling timeline of recent events (cron runs, checkpoints) |
| **Quick Actions** | Refresh dashboard, log events, trigger cron jobs |

- **Real-time updates** via WebSocket — no page refresh needed
- **SQLite persistence** for job history and activity log
- **Hermes integration** — push data from Hermes via `/hermes/sync` API

---

## Quick Start

```bash
cd ~/mission-control

# Start backend (API + WebSocket)
./start-public.sh

# Or with systemd (after install)
systemctl --user start mission-control
systemctl --user start mission-control-frontend
```

**Manual:**
```bash
# Backend
cd backend && pip install -r requirements.txt
python main.py  # port 5056

# Frontend
cd frontend && npm install && npm run build
# Serve dist/ with any static server on port 5175
```

---

## API Reference

### Hermes Sync (push data from Hermes)
```
POST /hermes/sync
{
  "todos": [...],
  "cron_jobs": [...],
  "processes": [...],
  "job_stats": { "date": "2026-04-06", "roles_submitted": 5, "source_coverage": {...} }
}
```

### Log a cron run
```
POST /hermes/cron-run?job_name=daily-job-search&status=ok
```

### Increment job counter
```
POST /hermes/increment-jobs?count=1&source=greenhouse
```

### WebSocket
```
WS /ws
```
Sends `state_full` on connect, `hermes_sync`, `activity_update` on changes.  
Send `{"type": "refresh"}` to request full state.  
Send `{"type": "log_event", "title": "...", "event_type": "manual"}` to log activity.

### State
```
GET /state        # Full dashboard state
GET /system/stats # System resources
```

---

## Hermes Integration

In your Hermes session, add this after any state change:

```python
import sys
sys.path.insert(0, '/home/ponzi/mission-control')
from sync_bridge import sync_all, log_cron_run, increment_job_count

# After todo/cron changes:
sync_all(todos=my_todos, cron_jobs=my_crons)

# After a cron job runs:
log_cron_run("job-name", "ok")

# After submitting a job application:
increment_job_count(count=1, source="greenhouse")
```

Or push directly to the API:
```python
import httpx
httpx.post("http://localhost:5056/hermes/sync", json=data)
```

---

## Auto-Start on Boot

```bash
cd ~/mission-control
./install-services.sh
systemctl --user enable mission-control mission-control-frontend
```

---

## Architecture

```
backend/
├── main.py              FastAPI + WebSocket
├── api/
│   ├── todos.py
│   ├── cron.py
│   ├── processes.py
│   ├── jobs.py
│   ├── system.py
│   └── hermes_sync.py   ← Push from Hermes
├── core/
│   ├── state.py         Singleton state + SQLite
│   └── websocket.py     Broadcast manager
└── models/schemas.py

frontend/
├── src/
│   ├── components/      React widgets
│   ├── hooks/useWebSocket.js
│   └── App.jsx
└── dist/                Static build
```

---

## Ports

| Service | Port | Bind |
|---------|------|------|
| Backend API | 5056 | 0.0.0.0 |
| Frontend | 5175 | 0.0.0.0 |
