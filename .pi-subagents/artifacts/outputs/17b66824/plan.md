# Implementation Plan — Add PI Agent Chat Tab with Provider/Model Selector

## Goal
Add a new "Chat" tab to the Mission Control dashboard (React frontend + FastAPI backend) that lets users talk to a PI agent, select provider/model (defaulting to `opencode-go/deepseek-v4-flash`), remember the model per session, send attachments, get warned when the model doesn't support the media they're sending, and see models sorted by price with their capabilities (text / vision / reasoning / context window).

---

## 1. Codebase Findings (Read-Only Exploration)

### 1.1 Project Stack
- **Tech stack:** React 18 + Vite 5 + Tailwind 3 + react-router-dom 7 (frontend); FastAPI + PostgreSQL/asyncpg + httpx (backend).
- **Frontend dir:** `frontend/src/` (package.json name = `mission-control`)
- **Backend dir:** `backend/` (FastAPI on port 5056)
- **Dev ports:** Frontend = 5173; Backend = 5056. In production, frontend served via nginx on 3000, API reachable at `${origin}/api`.
- **API base helper:** `frontend/src/lib/apiBase.js` — resolves dev vs prod API URL. Reuse `getApiBase()` in any new component.
- **Build tooling:** Vitest + @testing-library/react (see `frontend/src/pages/Kanban.test.jsx` for test patterns + mocking conventions).

### 1.2 Existing Routing & Navigation
- **Routes** (`frontend/src/App.jsx`): `/` (Dashboard), `/kanban` (Kanban), `/crons`, `/settings`, `/agent-guide`. **There is NO `/chat` route today.**
- **Nav** (`frontend/src/components/Nav.jsx`): Renders Link items: Overview, Kanban, Crons, Settings, Guide. Accepts a `rightContent` slot.
- **App shell:** `frontend/src/main.jsx` wraps `<App />` in `<AgentProvider>` (from `frontend/src/context/AgentContext.jsx`).

### 1.3 Existing Agent Configuration Pattern
- **AgentContext** (`frontend/src/context/AgentContext.jsx`):
  - Loads configured Hermes agents from `GET /settings/agents` and persists via `PUT /settings/agents`.
  - Each agent record: `{ id, name, url }` — these are "remote agent gateways", not LLM models.
  - Provides `agents`, `selectedAgent`, `selectedScopeId`, `setSelectedScopeId`, etc.
- **Backend settings** (`backend/api/settings.py` + `backend/core/state.py` → `_load_agent_settings` / `_persist_agent_settings`): Stored in the `app_settings` table under key `agent_settings`. Pydantic schema: `AgentConfig { id, name, url }` (`backend/models/schemas.py`).
- **Backend remote proxy** (`backend/api/remote.py`): Routes `/remote/state`, `/remote/test`, `/remote/cron/run`, `/remote/cron/patch`. It reaches out to remote agent URLs with `httpx`. Calls `/health`, `/state`, `/api/jobs`, `/v1/models` (Hermes platform). No chat proxy exists.

### 1.4 The "PI Agent" System (external to this repo)
- PI Agent lives at `~/.pi/agent/`:
  - `settings.json` — lists `enabledModels: ["opencode-go/deepseek-v4-flash", "opencode-go/deepseek-v4-pro", "opencode-go/qwen3.7-plus", ...]`. Default `defaultProvider: "fireworks"`, `defaultModel: "accounts/fireworks/models/deepseek-v4-flash"`. **Ticket wants default = `opencode-go/deepseek-v4-flash`**, matching the first entry in `enabledModels`.
  - `auth.json` — API keys for providers `opencode-go` (key: `sk-X46LL...`), `deepseek`, `fireworks`.
  - `opencode-subs.json` — workspace credentials for opencode-go subscription (multiple workspaces, `_active` rotation).
- **OpenCode-Go provider API:** Base URL `https://opencode.ai/zen/go/v1`. Auth: Bearer token (`OPENCODE_API_KEY` = `workspace_api_key`). Most models use `openai-completions` API; some MiniMax models use `anthropic-messages` API path `https://opencode.ai/zen/go` (note: no `/v1`).
- The usage endpoint `https://opencode.ai/zen/go/v1/usage` exists (used in `~/.pi/agent/extensions/opencode-subs.ts`).

### 1.5 Model Registry (source of truth for capabilities & pricing)
- File: `~/.pi/agent/npm/node_modules/@earendil-works/pi-ai/dist/models.generated.js` → exports `MODELS`.
- Each model entry has: `id, name, api ("openai-completions" | "anthropic-messages" | ...), provider, baseUrl, compat (optional: thinkingFormat), reasoning (bool), thinkingLevelMap (optional), input: ["text" | "image"], cost: { input, output, cacheRead, cacheWrite }, contextWindow, maxTokens`.
- **opencode-go models (cheapest→most expensive input price)**:
  - `deepseek-v4-flash` — $0.14 in / $0.28 out, ctx 1M, max 384K, input=text only, reasoning=true. **DEFAULT per ticket** ("budget text reasoning — 1M ctx, DeepSeek thinking"). (Severity: n/a — confirmed default.)
  - `qwen3.5-plus` — $0.20 in / $1.20 out, ctx 262K, input=text+image, thinkingFormat=qwen.
  - `qwen3.6-plus` — ≈$0.x in / ctx 1M, text+image.
  - `minimax-m2.5` — $0.30 in / $1.20 out, ctx 200K, anthropic-messages API, text only.
  - `minimax-m2.7` — $0.30 in / $1.20 out, ctx 200K, text only.
  - `mimo-v2.5` — $0.40 in / $2.00 out, ctx 1M, text+image.
  - `kimi-k2.5` — $0.60 in / $3.00 out, ctx 262K, text+image.
  - `kimi-k2.6` — $0.95 in / $4.00 out, ctx 262K, text+image.
  - `mimo-v2.5-pro` — $1.00 in / $3.00 out, ctx 1M, text only.
  - `glm-5.1` — $1.40 in / $4.40 out, ctx 202K, text only.
  - `deepseek-v4-pro` — $1.74 in / $3.48 out, ctx 1M, text only.
  - `qwen3.7-plus` — pricing TBC (likely ≥$1.74), text+image, ctx 1M.
  - `qwen3.7-max` — most expensive, text+image.
  - `kimi-k2.7-code` — vision-capable coding model with 262K output.
  - `minimax-m3` — vision + 512K ctx (cost TBC).
- Hand-curated suggested uses also live in `~/.pi/agent/extensions/opencode-go-compare.ts` (`SUGGESTED_USE` map keyed by model id), which already presents a UI with `👁 vision` / `🧠 reasoning` icons and pricing. **This is a strong reference for the frontend model selector UI.**

### 1.6 No Existing Chat Infrastructure
- `grep -ri chat` across the clone → 0 matches in app code. No `/api/chat`, no `/chat` route, no SSE proxy, no chat component.
- Backend has WebSocket at `/ws`, but only for dashboard state broadcasts. No streaming chat endpoint.
- No attachment handling anywhere in the app. The list of "media" types users can attach (image, file, etc.) needs to be defined.

### 1.7 Git Branch State
- Current branch: `ticket/add-pi-agent-to-chat-tab-with-provider-m-555159` (checked out from main, per `.git/HEAD` and `.git/logs/HEAD`).
- **No commits ahead of main yet** — no work in progress on the branch. The git log shows the checkout but no follow-up commits.

---

## 2. Architecture Decision: How PI agent talks to the backend

There are two viable paths. **Decision must be confirmed by supervisor before implementation.**

### Option A (Recommended): Backend proxies to OpenCode-Go API directly
- New backend endpoint `POST /chat/messages` (or `/api/chat`) on the FastAPI server.
- Backend reads `~/.pi/agent/auth.json` + `~/.pi/agent/settings.json` + `~/.pi/agent/opencode-subs.json` to get the API key and enabled models.
- Backend calls OpenCode-Go API at `https://opencode.ai/zen/go/v1/chat/completions` (OpenAI-compatible) for openai-completions models, or `https://opencode.ai/zen/go/v1/messages` (Anthropic-compatible) for anthropic-messages models.
- Streams tokens back to frontend via SSE (`text/event-stream`).
- Pros: Frontend never sees API keys. Reuses httpx pattern from `backend/api/remote.py`. Allows capability checking server-side.

### Option B (Not recommended): Frontend calls OpenCode-Go directly
- Frontend would need API keys exposed in browser → **security risk**. Reject this option.

### Models endpoint
- New `GET /chat/models` on backend that reads `models.generated.js` (or runs `pi --list-models` like `/root/pi-kanban/src/server.ts` does at line 170) and returns models with full metadata (id, name, provider, input capabilities, cost, contextWindow, reasoning, api type). Sort by `cost.input` ascending on the frontend (or backend).

### Capability/Warning Mapping
- A model's `input` array tells us what media types it accepts: `["text"]` = text only; `["text", "image"]` = supports image attachments.  
- When a user tries to attach an image and the selected model's `input` does NOT include `"image"`, **warn** before sending.
- File (non-image) attachments: only treat as text-extractable input for now (e.g. paste content as text) unless we add document parsing — needs decision.

### Session model memory
- Ticket says: "Each session should remember its model it used." Implement as:
  - **Frontend**: `localStorage` keyed by session id (or `sessionId` generated client-side) → `{ provider, modelId }`.
  - **Optional**: persist to backend per-session if multi-device memory is needed (out of scope unless supervisor wants it).

---

## Tasks

1. **Add Chat route and Nav link**
   - File: `frontend/src/App.jsx`
   - Changes: import new `Chat` page; add `<Route path="/chat" element={<Chat />} />`.
   - File: `frontend/src/components/Nav.jsx`
   - Changes: Add `<Link to="/chat">` between Guide and the rest, with `navClasses(location.pathname === '/chat')`.
   - Acceptance: Navigating to `/chat` renders the new page; nav highlights correctly.

2. **Create the Chat page component**
   - New file: `frontend/src/pages/Chat.jsx`
   - Changes: React component that:
     - Fetches models from new `GET ${apiBase}/chat/models` endpoint on mount (cache in state).
     - Renders the Header + Nav (same pattern as `Kanban.jsx`).
     - Renders a message list (messages state: `{ role, text, attachments }[]`).
     - Renders a composer (text input + file picker for attachments + send button).
     - On send: posts to `POST ${apiBase}/chat/messages` with `{ provider, modelId, messages, sessionId, attachments }`; consume SSE for streamed response.
     - Persists `sessionId` in `localStorage`; persists `{ provider, modelId }` per `sessionId`.
   - Acceptance: User can send a text message and receive a streamed reply.

3. **Create Provider/Model selector component**
   - New file: `frontend/src/components/ModelSelector.jsx`
   - Changes:
     - Props: `models`, `provider`, `modelId`, `onChange`.
     - Two-stage UI: provider dropdown (deduplicated from models list) + model dropdown.
     - Model dropdown entries show: model name, price (`in $X / out $Y`), context window, and capability icons (`👁` for vision, `🧠` for reasoning, `📝` for text-only).
     - **Sort models by `cost.input` ascending** (cheapest first) — ticket requirement.
     - Default to `opencode-go/deepseek-v4-flash` when no prior selection exists.
   - Acceptance: Selector shows models sorted by price; vision vs text models visually distinguished; switching provider updates available models.

4. **Add attachment support in the composer**
   - Modify: `frontend/src/pages/Chat.jsx` (composer section)
   - Changes:
     - `<input type="file" multiple accept="image/*,application/pdf,text/*" />` plus a "paperclip" button.
     - Maintain `pendingAttachments` state; render thumbnails for images, file chips for non-images.
     - On attach or before send, read each attachment's mime type. Compare against selected model `input` capability. If user attached an image (mime `^image/`) and model `input` does NOT include `"image"`, show a **warning banner**: "Model `{modelId}` does not support image inputs. Send anyway? (image will be dropped)".
   - Acceptance: Attaching an image to a text-only model produces a visible warning; user can cancel or drop the image.

5. **Persist model selection per session**
   - Modify: `frontend/src/pages/Chat.jsx`
   - Changes:
     - On mount: read `localStorage.getItem('pi-chat-session-id')`; if missing, generate `crypto.randomUUID()` and persist.
     - On mount/selection change: load/store `localStorage.getItem('pi-chat-model:${sessionId}')` = JSON `{ provider, modelId }`.
     - When a new session is started (new chat button), generate a new `sessionId` and reset selection to the default `opencode-go/deepseek-v4-flash`.
   - Acceptance: After refresh, the previously selected model is restored for that session id.

6. **Backend: add `GET /chat/models` endpoint**
   - New file: `backend/api/chat.py`
   - Changes:
     - `APIRouter(prefix="/chat", tags=["chat"])`.
     - `GET /models` → returns list of `{ provider, modelId, name, api, baseUrl, input, cost, contextWindow, maxTokens, reasoning }`.
     - Source: parse `~/.pi/agent/npm/node_modules/@earendil-works/pi-ai/dist/models.generated.js` via a lightweight parser (JSON-extract via regex on the generated file, OR run `pi --list-models` subprocess and join with a hardcoded capability map for opencode-go models). **Recommended:** vendored Python dict copied from `models.generated.js` for the `opencode-go` provider (keeps backend self-contained), filtered by `enabledModels` in `~/.pi/agent/settings.json`.
   - File: `backend/main.py` — register the new router (`app.include_router(chat.router)` plus `/api` alias).
   - Acceptance: `curl http://localhost:5056/chat/models` returns a JSON list including `opencode-go/deepseek-v4-flash` with `input=["text"]` and `cost.input=0.14`.

7. **Backend: add `POST /chat/messages` Streaming endpoint**
   - Modify: `backend/api/chat.py`
   - Changes:
     - Load API key for the chosen provider from `~/.pi/agent/auth.json`. For `opencode-go`, fall back to the active workspace's `workspace_api_key` from `~/.pi/agent/opencode-subs.json` if `auth.json` is missing.
     - Detect model `api` type from the models registry: `openai-completions` → POST to `{baseUrl}/chat/completions` with OpenAI-shaped body and `stream=true`; `anthropic-messages` → POST to `{baseUrl}/messages`.
     - Convert incoming `{ messages, attachments }` to OpenAI content blocks: text turns into `{type:"text",text:...}`; image attachments turn into `{type:"image_url",image_url:{url:"data:<mime>;base64,..."}}` (only if model supports `image`).
     - Return an `StreamingResponse(media_type="text/event-stream")`. Each OpenAI stream chunk becomes an SSE event `data: {delta}`. On finish, send `event: done`.
   - Acceptance: A `curl` posting a hello-world prompt returns a streamed reply from `deepseek-v4-flash`.

8. **Backend session memory (optional, see Decision needed)**
   - Modify: `backend/api/chat.py` (`backend/core/state.py` if persistence chosen).
   - Changes: If supervisor wants session memory on backend, add a UUID-keyed in-memory map (or app_settings table) with last used `{provider, modelId}`. Otherwise — rely entirely on frontend `localStorage` (Task 5).
   - Acceptance: chosen behavior agreed with supervisor.

9. **Tests**
   - New file: `frontend/src/pages/Chat.test.jsx`
     - Mock `fetch` and `EventSource` to fake the SSE stream.
     - Verify: default provider/model selection is `opencode-go/deepseek-v4-flash`; switching to a text-only model and attaching an image triggers a warning; sending a message appends both user + assistant bubbles; refresh restores previous selection.
   - New file: `backend/tests/test_chat_models.py`
     - Verify `/chat/models` returns sorted list with `opencode-go/deepseek-v4-flash` first or with the correct input capability flag.
   - Acceptance: `npm test` (vitest) passes; `pytest` passes.

10. **Build & smoke test**
    - Commands: `cd frontend && npm install && npm run build && npm test`; `cd backend && pip install -r requirements.txt && pytest`.
    - Acceptance: Build succeeds; tests green; backend boots.

---

## Files to Modify

- `frontend/src/App.jsx` — add Chat route.
- `frontend/src/components/Nav.jsx` — add Chat link.
- `backend/main.py` — register the new chat router (also under `/api` prefix).

## New Files

- `frontend/src/pages/Chat.jsx` — Chat page component (messages + composer + selector + attachment + session memory).
- `frontend/src/components/ModelSelector.jsx` — Provider + Model dropdown with prices and capability icons, sorted by input price.
- `frontend/src/pages/Chat.test.jsx` — Vitest tests for the Chat page.
- `backend/api/chat.py` — FastAPI router with `/chat/models` and streaming `/chat/messages`.
- `backend/tests/test_chat_models.py` — pytest tests for `/chat/models`.

---

## Dependencies

- Tasks 1 (route + nav) must precede Task 2 (page).\n- Task 2 depends on Task 6 (backend /chat/models exists) and Task 7 (backend streaming endpoint).
- Task 3 (ModelSelector) depends on Task 6's response shape — keep them consistent.
- Task 4 (attachment warning) depends on Task 3 (we need the selected model's `input` capability).
- Task 8 (backend session memory) is gated on the Decision below — default to frontend `localStorage` only.
- Task 9 (tests) depends on Tasks 2–7.
- Task 10 (build/test) depends on all other tasks.

---

## Risks & Open Decisions

### Severity: HIGH

- **Decision needed (supervisor):** Backend proxies to OpenCode-Go vs running `pi --rpc`/`pi --skill` subprocess. Recommended: backend proxies via httpx (Option A). Unless confirmed, Tasks 6 and 7 are blocked.
- **Decision needed (supervisor):** Does the backend running this FastAPI server (port 5056) actually have `~/.pi/agent/auth.json` / `opencode-subs.json` accessible with valid keys on the deployment host? If not, we need an env var override (`OPENCODE_API_KEY`) and a fallback for the active workspace id. The current `auth.json` contains real API keys (`sk-X46LL...`) we should NOT log or echo back to the frontend.
- **API key secret leakage:** `auth.json` / `opencode-subs.json` contain plaintext secrets. The new endpoints MUST never return keys to the frontend. Add a smoke test that greps the response body of `/chat/models` for `sk-` and fails on match.
- **Two different API shapes:** opencode-go has both `openai-completions` (`/zen/go/v1/chat/completions`) and `anthropic-messages` (`/zen/go/messages`) models (e.g. `minimax-m2.5`). Support both request/response shapes or restrict the model list to openai-completions models only. **Needs supervisor decision**: restrict to openai-completions-only subset (simpler, drops MiniMax M2.5) or support both.
- **Sensitive data in attachments:** Image attachments will be base64-encoded and shipped through the backend to opencode. Confirm acceptable file size caps (suggest 5MB) and allowed mime types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`). Non-image attachments: are they allowed at all? If the user attaches a PDF/text file, do we (a) extract text server-side, (b) reject it, or (c) only send images? Ticket is ambiguous.

### Severity: MEDIUM

- **Model metadata source:** The most reliable source is the auto-generated `models.generated.js` in pi-ai node_modules. But that file is far away from `backend/`. Vendoring a Python copy means we may drift out of sync if pi-ai adds new models. Mitigation: optionally also call `pi --list-models` subprocess (modeled on `/root/pi-kanban/src/server.ts:170`) and merge the two. Decide which is canonical.
- **Streaming format compatibility:** FastAPI StreamingResponse with SSE works with httpx's streaming HTTP client (use `client.stream("POST", ...)`). Need to make sure the OpenAI chunk delta format is properly relayed. Verify with a real call (caveat: must use the actual key).
- **Session id storage collision:** The Kanban page uses `localStorage` only for UI niceties — but if we add other PI features, namespace keys to avoid conflicts (use `pi-mc-chat:` prefix).
- **Empty `enabledModels` fallback:** If `~/.pi/agent/settings.json` does not exist locally on the deployment server, the selector would be empty. Provide a hardcoded fallback list of opencode-go models matching the ticket's default.
- **CORS:** Backend already allows `*` origins — fine for local dev. In prod, frontend served via nginx on port 3000 talks to backend on 5056 (or via ingress prefix). Verify the new `/api/chat/*` route is reachable through the nginx `/api` location if deployed via docker-compose (`docker-compose.yml`).

### Severity: LOW

- **Tailwind not in backend:** Confirm `tailwind.config.js` scans `index.html`, `./src/**/*.{js,jsx}` — new components under `src/pages` and `src/components` are already covered. Re-run `npm run build` to regenerate the CSS.
- **Vitest test mocking:** Follow the established pattern in `Kanban.test.jsx` (mock useWebSocket, AgentContext, Nav, Header, LoadingOverlay, apiBase). For Chat, also mock `EventSource` since Vitest's jsdom does not ship it.
- **No staged work:** Git branch is empty — no merge conflicts expected.

---

## Required Evidence Summary

- Findings above include concrete file paths and severities for every notable observation.
- No files have been modified (read-only planning run).
- The git branch `ticket/add-pi-agent-to-chat-tab-with-provider-m-555159` is checked out but has NO diverging commits yet.
- Two supervisor decisions required (HIGH severity) before implementation can proceed to Tasks 6/7.