"""Hermes Integration Module

Import this in Hermes to push realtime data to Mission Control dashboard.

Usage:
    from hermes_integration import push_todos, push_cron, push_processes
    
    # After any todo change:
    push_todos(todo_list)
    
    # After cron list:
    push_cron(cronjobs)
    
    # After process list:
    push_processes(processes)
"""

import httpx
from datetime import datetime
from typing import List, Dict, Any

DASHBOARD_URL = "http://localhost:5056"


def _clean_datetime(obj: Dict) -> Dict:
    """Clean datetime objects for JSON serialization."""
    result = {}
    for k, v in obj.items():
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


def push_todos(todos: List[Dict]):
    """Push current todo list to dashboard."""
    cleaned = [_clean_datetime(t) for t in todos]
    try:
        r = httpx.post(f"{DASHBOARD_URL}/todos/sync", json=cleaned, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def push_cron(cronjobs: List[Dict]):
    """Push cron jobs to dashboard."""
    # Transform Hermes cron format to dashboard format
    formatted = []
    for job in cronjobs:
        # Map Hermes fields to dashboard schema
        formatted.append({
            "id": job.get("id", job.get("job_id", "unknown")),
            "name": job.get("name", "Unnamed"),
            "schedule": job.get("schedule", ""),
            "deliver": job.get("deliver", ""),
            "enabled": job.get("enabled", not job.get("paused", False)),
            "last_run": job.get("last_run", job.get("last_run_at")),
            "next_run": job.get("next_run", job.get("next_run_at")),
            "last_status": job.get("last_status", "unknown"),
            "state": job.get("state", "unknown"),
            "prompt_preview": job.get("prompt_preview"),
            "model": job.get("model"),
            "provider": job.get("provider"),
            "base_url": job.get("base_url"),
            "repeat": job.get("repeat"),
            "paused_at": job.get("paused_at"),
            "paused_reason": job.get("paused_reason"),
        })
    
    try:
        r = httpx.post(f"{DASHBOARD_URL}/cron/sync", json=formatted, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def push_processes(processes: List[Dict]):
    """Push running processes to dashboard."""
    cleaned = [_clean_datetime(p) for p in processes]
    try:
        r = httpx.post(f"{DASHBOARD_URL}/processes/sync", json=cleaned, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def push_job_stats(roles_submitted: int = 0, roles_queued: int = 0, sources: Dict[str, int] = None):
    """Push job search stats to dashboard."""
    stats = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "roles_submitted": roles_submitted,
        "roles_queued": roles_queued,
        "source_coverage": sources or {}
    }
    try:
        r = httpx.post(f"{DASHBOARD_URL}/jobs/sync", json=stats, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def sync_all(todos=None, cronjobs=None, processes=None):
    """Sync all data sources at once."""
    results = {}
    if todos:
        results["todos"] = push_todos(todos)
    if cronjobs:
        results["cron"] = push_cron(cronjobs)
    if processes:
        results["processes"] = push_processes(processes)
    return results
