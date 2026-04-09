from fastapi import APIRouter, HTTPException, Query, Body
from urllib.parse import urlparse
from datetime import datetime
from typing import Any, Dict, List
import httpx

router = APIRouter(prefix="/remote", tags=["remote"])

_TIMEOUT = 8.0


def _normalize_target(target: str) -> str:
    raw = (target or "").strip().rstrip("/")
    if not raw:
        raise HTTPException(status_code=400, detail="Missing target URL")

    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Target must be a valid http(s) URL")

    return raw


def _map_hermes_jobs_to_state(jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
    mapped_crons = []
    for j in jobs:
        mapped_crons.append({
            "id": j.get("id", ""),
            "name": j.get("name") or "Unnamed",
            "schedule": j.get("schedule_display") or (j.get("schedule") or {}).get("display") or (j.get("schedule") or {}).get("expr") or "",
            "deliver": j.get("deliver") or "origin",
            "enabled": bool(j.get("enabled", True)),
            "last_run": j.get("last_run_at"),
            "next_run": j.get("next_run_at"),
            "last_status": j.get("last_status") or "unknown",
            "state": j.get("state") or "unknown",
            "prompt_preview": j.get("prompt"),
            "model": j.get("model"),
            "provider": j.get("provider"),
            "base_url": j.get("base_url"),
            "repeat": (j.get("repeat") or {}).get("display") if isinstance(j.get("repeat"), dict) else None,
            "paused_at": j.get("paused_at"),
            "paused_reason": j.get("paused_reason"),
        })

    return {
        "todos": [],
        "cron_jobs": mapped_crons,
        "active_processes": [],
        "job_search_today": None,
        "system_stats": None,
        "recent_activity": [],
        "updated_at": datetime.now().isoformat(),
    }


@router.get("/state")
async def remote_state(target: str = Query(..., description="Remote gateway base URL")):
    base = _normalize_target(target)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            health = await client.get(f"{base}/health")
            if health.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Remote /health returned {health.status_code}")

            platform = ""
            try:
                platform = str((health.json() or {}).get("platform", "")).lower()
            except Exception:
                platform = ""

            if platform == "hermes-agent":
                jobs_res = await client.get(f"{base}/api/jobs")
                if jobs_res.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Remote /api/jobs returned {jobs_res.status_code}")
                jobs = (jobs_res.json() or {}).get("jobs", [])
                return _map_hermes_jobs_to_state(jobs if isinstance(jobs, list) else [])

            state_res = await client.get(f"{base}/state")
            if state_res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Remote /state returned {state_res.status_code}")
            return state_res.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Remote fetch failed: {e}")


@router.post("/cron/run")
async def remote_cron_run(
    target: str = Query(..., description="Remote gateway base URL"),
    job_id: str = Query(..., description="Cron job id"),
):
    base = _normalize_target(target)
    jid = (job_id or '').strip()
    if not jid:
        raise HTTPException(status_code=400, detail="Missing job_id")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            res = await client.post(f"{base}/cron/{jid}/run")
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=502, detail=f"Remote cron run returned {res.status_code}")
            if res.status_code == 204:
                return {"ok": True}
            return res.json() if res.text else {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Remote fetch failed: {e}")


@router.patch("/cron")
async def remote_cron_patch(
    target: str = Query(..., description="Remote gateway base URL"),
    job_id: str = Query(..., description="Cron job id"),
    payload: Dict[str, Any] = Body(default={}),
):
    base = _normalize_target(target)
    jid = (job_id or '').strip()
    if not jid:
        raise HTTPException(status_code=400, detail="Missing job_id")

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            res = await client.patch(f"{base}/cron/{jid}", json=payload or {})
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=502, detail=f"Remote cron patch returned {res.status_code}")
            if res.status_code == 204:
                return {"ok": True}
            return res.json() if res.text else {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Remote fetch failed: {e}")


@router.get("/test")
async def remote_test(target: str = Query(..., description="Remote gateway base URL")):
    base = _normalize_target(target)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            health = await client.get(f"{base}/health")
            if health.status_code != 200:
                return {"ok": False, "kind": "unknown", "message": f"/health returned {health.status_code}"}

            platform = ""
            try:
                platform = str((health.json() or {}).get("platform", "")).lower()
            except Exception:
                platform = ""

            if platform == "hermes-agent":
                models = await client.get(f"{base}/v1/models")
                if models.status_code in (200, 401):
                    return {
                        "ok": True,
                        "kind": "hermes",
                        "message": f"Connected (Hermes API server). /health OK, /v1/models={models.status_code}",
                    }
                return {
                    "ok": True,
                    "kind": "hermes",
                    "message": f"Connected (Hermes API server). /health OK, /v1/models={models.status_code}",
                }

            state_res = await client.get(f"{base}/state")
            if state_res.status_code == 200:
                payload = state_res.json() or {}
                todos = payload.get("todos") or []
                crons = payload.get("cron_jobs") or []
                return {
                    "ok": True,
                    "kind": "mission-control",
                    "message": f"Connected (Mission Control). /state OK • {len(todos)} tasks, {len(crons)} crons",
                }

            return {"ok": False, "kind": "unknown", "message": f"/state returned {state_res.status_code}"}
    except Exception as e:
        return {"ok": False, "kind": "unknown", "message": f"Connection failed: {e}"}
