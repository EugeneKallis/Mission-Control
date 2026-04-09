#!/usr/bin/env python3
"""
Mission Control Hermes Sync Bridge

This script syncs live data from Hermes (todos, cron jobs, processes)
to the Mission Control dashboard. Run it alongside the dashboard.

Usage:
    python3 sync-bridge.py
    
Or from within Hermes:
    from sync_bridge import sync_all
    sync_all()
"""

import httpx
import json
import os
import sys
import subprocess
from datetime import datetime, timedelta
from typing import Optional

DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:5056")
HERMES_API = os.environ.get("HERMES_API", "http://localhost:8000")


def get_hermes_todos() -> list:
    """Fetch todos from Hermes agent API."""
    try:
        r = httpx.get(f"{HERMES_API}/todos", timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return []


def get_hermes_crons() -> list:
    """Fetch cron jobs from Hermes agent API."""
    try:
        r = httpx.get(f"{HERMES_API}/cronjobs", timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return []


def get_system_processes() -> list:
    """Get running Python/Hermes processes."""
    procs = []
    try:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if "python" in line.lower() and "grep" not in line:
                parts = line.split()
                if len(parts) >= 11:
                    procs.append({
                        "command": " ".join(parts[10:])[:100],
                        "pid": int(parts[1]),
                        "status": parts[7] if len(parts) > 7 else "unknown"
                    })
    except Exception:
        pass
    return procs


def format_todos(todos: list) -> list:
    """Format Hermes todos for dashboard."""
    formatted = []
    for t in todos:
        if isinstance(t, dict):
            formatted.append({
                "id": t.get("id", ""),
                "content": t.get("content", ""),
                "status": t.get("status", "pending"),
                "created_at": t.get("created_at", datetime.now().isoformat()),
                "completed_at": t.get("completed_at")
            })
        elif hasattr(t, 'id'):
            formatted.append({
                "id": t.id,
                "content": t.content,
                "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
                "created_at": t.created_at.isoformat() if hasattr(t.created_at, 'isoformat') else str(t.created_at),
                "completed_at": t.completed_at.isoformat() if hasattr(t.completed_at, 'isoformat') and t.completed_at else None
            })
    return formatted


def format_crons(crons: list) -> list:
    """Format Hermes cron jobs for dashboard."""
    formatted = []
    for c in crons:
        if isinstance(c, dict):
            formatted.append({
                "id": c.get("id", c.get("job_id", "")),
                "name": c.get("name", "Unnamed"),
                "schedule": c.get("schedule", ""),
                "deliver": c.get("deliver", "origin"),
                "enabled": c.get("enabled", True),
                "last_run": c.get("last_run", c.get("last_run_at")),
                "next_run": c.get("next_run", c.get("next_run_at")),
                "last_status": c.get("last_status", "unknown"),
                "state": c.get("state", "unknown"),
                "prompt_preview": c.get("prompt_preview"),
                "model": c.get("model"),
                "provider": c.get("provider"),
                "base_url": c.get("base_url"),
                "repeat": c.get("repeat"),
                "paused_at": c.get("paused_at"),
                "paused_reason": c.get("paused_reason"),
            })
    return formatted


def sync_to_dashboard(data: dict) -> bool:
    """Push all data to dashboard via Hermes sync endpoint."""
    try:
        r = httpx.post(
            f"{DASHBOARD_URL}/hermes/sync",
            json=data,
            timeout=10
        )
        return r.status_code == 200
    except Exception as e:
        print(f"Sync failed: {e}", file=sys.stderr)
        return False


def sync_all(todos: list = None, cron_jobs: list = None) -> bool:
    """
    Main sync function — call this from Hermes after any state change.
    
    Example from Hermes:
        sync_all(todos=my_todos, cron_jobs=my_crons)
    """
    data = {
        "todos": format_todos(todos) if todos else [],
        "cron_jobs": format_crons(cron_jobs) if cron_jobs else [],
        "processes": [],
        "job_stats": None
    }
    return sync_to_dashboard(data)


def log_cron_run(job_name: str, status: str = "ok") -> bool:
    """Log a cron job run to the activity feed."""
    try:
        r = httpx.post(
            f"{DASHBOARD_URL}/hermes/cron-run",
            params={"job_name": job_name, "status": status},
            timeout=5
        )
        return r.status_code == 200
    except Exception:
        return False


def increment_job_count(count: int = 1, source: str = "manual") -> bool:
    """Increment job submission counter."""
    try:
        r = httpx.post(
            f"{DASHBOARD_URL}/hermes/increment-jobs",
            params={"count": count, "source": source},
            timeout=5
        )
        return r.status_code == 200
    except Exception:
        return False


def main():
    """CLI mode — manual sync."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Mission Control sync...")
    
    # Try Hermes API first, fallback to empty data
    todos = get_hermes_todos()
    crons = get_hermes_crons()
    
    success = sync_all(todos=todos, cron_jobs=crons)
    if success:
        print(f"  ✅ Synced {len(todos)} todos, {len(crons)} crons")
    else:
        print("  ⚠️  Dashboard not reachable — is it running?")


if __name__ == "__main__":
    main()
