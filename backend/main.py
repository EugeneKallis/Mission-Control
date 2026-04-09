from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from api import todos, cron, processes, jobs, system, hermes_sync, remote, settings
from core.websocket import handle_websocket
from core.state import state
import uvicorn
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
app.include_router(remote.router)
app.include_router(settings.router)

# Ingress-friendly aliases under /api (for k8s host routing)
app.include_router(todos.router, prefix="/api")
app.include_router(cron.router, prefix="/api")
app.include_router(processes.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(hermes_sync.router, prefix="/api")
app.include_router(remote.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_websocket(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.2.0"}


@app.get("/api/health")
async def health_api_alias():
    return {"status": "ok", "version": "0.2.0"}


@app.get("/state")
async def get_full_state():
    """Get complete dashboard state."""
    await state.refresh_todos_from_storage()
    return state.get_full_state()


@app.get("/api/state")
async def get_full_state_api_alias():
    """Get complete dashboard state (api alias)."""
    await state.refresh_todos_from_storage()
    return state.get_full_state()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB-backed state first
    await state.initialize_storage()
    # Load full cron jobs from Hermes's jobs.json on startup (local-only; harmless if file missing)
    state.load_crons_from_hermes()
    yield


# Apply lifespan
app.router.lifespan_context = lifespan


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5056, reload=False)
