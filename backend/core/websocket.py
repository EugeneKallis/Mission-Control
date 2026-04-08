from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
from datetime import datetime
from core.state import state


class ConnectionManager:
    """Manages WebSocket connections and broadcasts updates."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Send initial full state
        await self._send_json(websocket, {
            "type": "state_full",
            "data": state.get_full_state()
        })
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def _send_json(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_json(message)
        except Exception:
            pass
    
    async def broadcast(self, message: dict):
        async with self._lock:
            disconnected = []
            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            for conn in disconnected:
                self.disconnect(conn)
    
    async def broadcast_state_change(self, change_type: str, data: Any = None):
        await self.broadcast({
            "type": change_type,
            "data": data or state.get_full_state(),
            "timestamp": datetime.now().isoformat()
        })


manager = ConnectionManager()


async def handle_websocket(websocket: WebSocket):
    """WebSocket handler for dashboard connections."""
    await manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            
            if msg_type == "ping":
                await manager._send_json(websocket, {"type": "pong"})
            
            elif msg_type == "refresh":
                await manager._send_json(websocket, {
                    "type": "state_full",
                    "data": state.get_full_state()
                })
            
            elif msg_type == "log_event":
                # Allow dashboard to log an activity event
                state.activity_log.add(
                    event_type=message.get("event_type", "manual"),
                    title=message.get("title", ""),
                    detail=message.get("detail"),
                    status=message.get("status", "info")
                )
                await manager.broadcast_state_change("activity_update")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
