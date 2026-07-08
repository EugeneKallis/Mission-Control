"""
Chat API — sends messages to the PI agent LLM (opencode-go) and returns
available models/providers from the local PI agent configuration.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import json
import os
import httpx
import base64

router = APIRouter(prefix="/chat", tags=["chat"])

# ─── Static Model Registry ──────────────────────────────────────────────
# Built-in mapping of opencode-go model IDs to display metadata.
# Sourced from @earendil-works/pi-ai provider definitions.
MODEL_REGISTRY: Dict[str, dict] = {
    "opencode-go/deepseek-v4-flash": {
        "name": "DeepSeek V4 Flash",
        "provider": "opencode-go",
        "pricing": {"input": 0.14, "output": 0.28},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/deepseek-v4-pro": {
        "name": "DeepSeek V4 Pro",
        "provider": "opencode-go",
        "pricing": {"input": 1.74, "output": 3.48},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/qwen3.7-plus": {
        "name": "Qwen3.7 Plus",
        "provider": "opencode-go",
        "pricing": {"input": 0.40, "output": 1.60},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/qwen3.7-max": {
        "name": "Qwen3.7 Max",
        "provider": "opencode-go",
        "pricing": {"input": 2.50, "output": 7.50},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/qwen3.6-plus": {
        "name": "Qwen3.6 Plus",
        "provider": "opencode-go",
        "pricing": {"input": 0.50, "output": 3.00},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/minimax-m3": {
        "name": "MiniMax M3 (3x usage)",
        "provider": "opencode-go",
        "pricing": {"input": 0.30, "output": 1.20},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/minimax-m2.7": {
        "name": "MiniMax M2.7",
        "provider": "opencode-go",
        "pricing": {"input": 0.30, "output": 1.20},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 204_800,
    },
    "opencode-go/mimo-v2.5-pro": {
        "name": "MiMo V2.5 Pro",
        "provider": "opencode-go",
        "pricing": {"input": 1.74, "output": 3.48},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 1_048_576,
    },
    "opencode-go/mimo-v2.5": {
        "name": "MiMo V2.5",
        "provider": "opencode-go",
        "pricing": {"input": 0.14, "output": 0.28},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/kimi-k2.7-code": {
        "name": "Kimi K2.7 Code",
        "provider": "opencode-go",
        "pricing": {"input": 0.95, "output": 4.00},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 262_144,
    },
    "opencode-go/kimi-k2.6": {
        "name": "Kimi K2.6",
        "provider": "opencode-go",
        "pricing": {"input": 0.95, "output": 4.00},
        "capabilities": ["text", "vision", "tools", "thinking"],
        "context_length": 262_144,
    },
    "opencode-go/glm-5.2": {
        "name": "GLM-5.2",
        "provider": "opencode-go",
        "pricing": {"input": 1.40, "output": 4.40},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 1_000_000,
    },
    "opencode-go/glm-5.1": {
        "name": "GLM-5.1",
        "provider": "opencode-go",
        "pricing": {"input": 1.40, "output": 4.40},
        "capabilities": ["text", "tools", "thinking"],
        "context_length": 202_752,
    },
}

# ─── File paths ─────────────────────────────────────────────────────────
_PI_AGENT_DIR = os.path.expanduser("~/.pi/agent")
_SETTINGS_PATH = os.path.join(_PI_AGENT_DIR, "settings.json")
_AUTH_PATH = os.path.join(_PI_AGENT_DIR, "auth.json")

# ─── API configuration ──────────────────────────────────────────────────
OPENCODE_API_BASE = "https://opencode.ai/zen/go/v1"
OPENCODE_CHAT_URL = f"{OPENCODE_API_BASE}/chat/completions"
REQUEST_TIMEOUT = 60.0

# ─── Attachment validation limits ───────────────────────────────────────
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_ATTACHMENT_PREFIXES = ("image/", "text/", "application/pdf")

# ─── Provider display names ─────────────────────────────────────────────
PROVIDER_NAMES = {
    "opencode-go": "OpenCode Zen Go",
    "deepseek": "DeepSeek",
    "fireworks": "Fireworks AI",
}


def _load_json(path: str) -> dict:
    """Load and return JSON from a file path, returning {} on failure."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, PermissionError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to read {path}: {e}")


def _get_opencode_api_key() -> str:
    """Return the opencode-go API key from auth.json."""
    auth = _load_json(_AUTH_PATH)
    key = (auth.get("opencode-go") or {}).get("key", "")
    if not key:
        raise HTTPException(status_code=500, detail="opencode-go API key not found in auth.json")
    return key


# ─── Request / Response models ──────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    provider: str = "opencode-go"
    model: str = "opencode-go/deepseek-v4-flash"
    history: List[Dict[str, Any]] = []
    attachments: List[Dict[str, Any]] = []


class ChatResponse(BaseModel):
    role: str = "assistant"
    content: str
    model: str


class ModelInfo(BaseModel):
    id: str
    provider: str
    name: str
    pricing: Dict[str, float]
    capabilities: List[str]
    context_length: int


class ModelsResponse(BaseModel):
    models: List[ModelInfo]


class ProviderInfo(BaseModel):
    id: str
    name: str


class ProvidersResponse(BaseModel):
    providers: List[ProviderInfo]


# ─── Endpoints ──────────────────────────────────────────────────────────

_OPENCODE_CHAT_HEADERS = {
    "Content-Type": "application/json",
}


@router.post("", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    """Send a message to the PI agent LLM and return the assistant response."""
    api_key = _get_opencode_api_key()

    # ── Validate attachments (server-side limits prevent cost/DoS abuse) ──
    attachments = payload.attachments or []
    if len(attachments) > MAX_ATTACHMENTS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many attachments: {len(attachments)} (max {MAX_ATTACHMENTS}).",
        )
    for att in attachments:
        att_type = (att.get("type") or "").lower()
        if not att_type.startswith(ALLOWED_ATTACHMENT_PREFIXES):
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported attachment type '{att_type}' for '{att.get('name', 'file')}'. "
                       f"Allowed: image/*, text/*, application/pdf.",
            )
        att_data = att.get("data", "") or ""
        # Decode base64 to measure true byte size; guard against malformed data.
        try:
            decoded_size = len(base64.b64decode(att_data, validate=True))
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=f"Attachment '{att.get('name', 'file')}' has invalid base64 data.",
            )
        if decoded_size > MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=422,
                detail=f"Attachment '{att.get('name', 'file')}' is too large "
                       f"({decoded_size} bytes, max {MAX_ATTACHMENT_BYTES}).",
            )

    # Strip provider prefix from model ID if present — the model ID already
    # encodes the provider, so the request `provider` field is cosmetic.
    model_id = payload.model
    if "/" in model_id:
        model_id = model_id.split("/", 1)[1]

    # Build messages array from history + current message.
    # Validate history roles: only "user" and "assistant" are allowed to
    # prevent system-prompt injection from direct API callers.
    ALLOWED_HISTORY_ROLES = {"user", "assistant"}
    messages = []
    for entry in payload.history:
        role = entry.get("role")
        if role not in ALLOWED_HISTORY_ROLES:
            continue
        messages.append({"role": role, "content": entry.get("content", "")})
    user_message: Dict[str, Any] = {"role": "user", "content": payload.message}

    # If there are file attachments, build a multi-part content array
    if attachments:
        content_parts: List[Dict[str, Any]] = [{"type": "text", "text": payload.message}]
        for att in attachments:
            att_type = (att.get("type") or "").lower()
            att_data = att.get("data", "")
            if att_type.startswith("image/"):
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{att_type};base64,{att_data}"},
                })
            elif att_type == "application/pdf":
                content_parts.append({
                    "type": "text",
                    "text": f"[Attached PDF: {att.get('name', 'document.pdf')}]",
                })
            else:
                content_parts.append({
                    "type": "text",
                    "text": f"[Attached file: {att.get('name', 'file')} ({att_type})]",
                })
        user_message["content"] = content_parts

    messages.append(user_message)

    # Build the OpenAI-compatible request body
    request_body = {
        "model": model_id,
        "messages": messages,
        "max_tokens": 4096,
    }

    headers = {**_OPENCODE_CHAT_HEADERS, "Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            resp = await client.post(OPENCODE_CHAT_URL, json=request_body, headers=headers)
            if resp.status_code != 200:
                detail = "Unknown error"
                try:
                    detail = resp.text
                except Exception:
                    pass
                raise HTTPException(
                    status_code=502,
                    detail=f"LLM API returned {resp.status_code}: {detail}",
                )
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLM API request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"LLM API request failed: {e}")

    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(status_code=502, detail="LLM returned no choices")

    choice = choices[0]
    message_data = choice.get("message", {})
    content = message_data.get("content", "") or ""

    return ChatResponse(role="assistant", content=content, model=payload.model)


@router.get("/models", response_model=ModelsResponse)
async def list_models():
    """Return available models with metadata, sorted by input price (cheapest first)."""
    # Merge static registry with enabled models from settings.json
    settings = _load_json(_SETTINGS_PATH)
    enabled_ids = set(settings.get("enabledModels", []))

    models_list = []
    for model_id, info in MODEL_REGISTRY.items():
        if enabled_ids and model_id not in enabled_ids:
            continue
        models_list.append(ModelInfo(
            id=model_id,
            provider=info["provider"],
            name=info["name"],
            pricing=info["pricing"],
            capabilities=info["capabilities"],
            context_length=info["context_length"],
        ))

    # Sort by input price (cheapest first)
    models_list.sort(key=lambda m: m.pricing.get("input", 0))
    return ModelsResponse(models=models_list)


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers():
    """Return available providers from auth.json keys."""
    auth = _load_json(_AUTH_PATH)

    providers_list = []
    for key in auth:
        entry = auth[key]
        if isinstance(entry, dict) and entry.get("type") == "api_key":
            providers_list.append(ProviderInfo(
                id=key,
                name=PROVIDER_NAMES.get(key, key),
            ))

    return ProvidersResponse(providers=providers_list)
