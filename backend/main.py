from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from api import todos, cron, processes, jobs, system, hermes_sync, skills, remote
from core.websocket import handle_websocket, manager
from core.state import state
import uvicorn
import asyncio
import subprocess
from contextlib import asynccontextmanager

app = FastAPI(
    title="Mission Control",
    description="Real-time dashboard for Hermes Agent",
    version="0.2.0"
)

# CORS — public access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(todos.router)
app.include_router(cron.router)
app.include_router(processes.router)
app.include_router(jobs.router)
app.include_router(system.router)
app.include_router(hermes_sync.router)
app.include_router(skills.router)
app.include_router(remote.router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_websocket(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.2.0"}


@app.get("/state")
async def get_full_state():
    """Get complete dashboard state."""
    return state.get_full_state()


def parse_cron_list(output: str):
    """Parse hermes cron list output to extract job info."""
    import re
    jobs = []
    lines = output.strip().splitlines()
    
    current_job = None
    for line in lines:
        # Strip leading/trailing whitespace but preserve internal spacing for detection
        stripped = line.strip()
        if not stripped:
            continue
        
        # Skip box drawing characters and header/separator lines
        if stripped.startswith('┌') or stripped.startswith('│') or stripped.startswith('└'):
            continue
        if 'Scheduled Jobs' in stripped:
            continue
        
        # Job ID line: "  c4071d6a4732 [active]" with leading spaces
        match = re.match(r'^\s*([0-9a-f]+)\s*\[(\w+)\]', stripped)
        if match:
            if current_job:
                jobs.append(current_job)
            current_job = {
                "id": match.group(1),
                "state": match.group(2),
                "name": "",
                "schedule": "",
                "deliver": "",
                "next_run": None,
                "last_run": None,
                "enabled": match.group(2) == "active",
            }
        elif current_job:
            # Field lines: "    Name:      Friday Media Suggestions"
            if 'Name:' in stripped:
                current_job["name"] = stripped.split('Name:')[1].strip()
            elif 'Schedule:' in stripped:
                current_job["schedule"] = stripped.split('Schedule:')[1].strip()
            elif 'Next run:' in stripped:
                current_job["next_run"] = stripped.split('Next run:')[1].strip()
            elif 'Deliver:' in stripped:
                current_job["deliver"] = stripped.split('Deliver:')[1].strip()
            elif 'Last run:' in stripped:
                current_job["last_run"] = stripped.split('Last run:')[1].strip()
    
    if current_job:
        jobs.append(current_job)
    
    return jobs


@app.get("/hermes/poll")
async def poll_hermes():
    """Poll Hermes CLI for current todos, crons, and processes."""
    result = {
        "todos": [],
        "cron_jobs": [],
        "processes": [],
        "skills": []
    }
    
    # Poll cron jobs via hermes cron list
    try:
        proc = subprocess.run(
            ["hermes", "cron", "list"],
            capture_output=True, text=True, timeout=15
        )
        if proc.returncode == 0:
            parsed = parse_cron_list(proc.stdout)
            from models.schemas import CronJob
            result["cron_jobs"] = [
                CronJob(
                    id=j["id"],
                    name=j["name"] or "Unnamed",
                    schedule=j["schedule"] or "",
                    deliver=j["deliver"] or "origin",
                    enabled=j["enabled"],
                    next_run=j["next_run"],
                    last_run=j["last_run"],
                    last_status="ok" if j["enabled"] else "paused",
                    state=j["state"],
                    prompt_preview=None,
                    model=None
                ).model_dump(mode='json')
                for j in parsed
            ]
    except Exception as e:
        print(f"Error polling crons: {e}")
    
    return result


# Background poll loop - runs every 30s and broadcasts via WebSocket
async def poll_loop():
    while True:
        try:
            # Get current state via poll endpoint
            data = await poll_hermes()
            # Merge with existing state (keep todos/processes from current state)
            full_state = state.get_full_state()
            full_state["cron_jobs"] = data["cron_jobs"]
            # Broadcast to all WebSocket clients
            await manager.broadcast({
                "type": "hermes_sync",
                "data": full_state
            })
        except Exception as e:
            print(f"Poll loop error: {e}")
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load full cron jobs from Hermes's jobs.json on startup
    state.load_crons_from_hermes()
    # Start background poll loop
    task = asyncio.create_task(poll_loop())
    yield
    task.cancel()


# Apply lifespan
app.router.lifespan_context = lifespan


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5056, reload=False)
