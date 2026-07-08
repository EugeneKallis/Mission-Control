# Task for worker


You are implementing: **"Add PI agent to Chat tab with provider/model selector and attachments"**

## Repo Location
/root/pi-kanban/state/clones/t1783538555159

## Current Branch (already checked out)
ticket/add-pi-agent-to-chat-tab-with-provider-m-555159
(This branch is based on develop and has no committed changes yet)

## Codebase Context

### Frontend Structure
- **React+Vite+Tailwind** SPA in `frontend/`
- **Router** in `frontend/src/App.jsx` — 5 routes: `/`, `/kanban`, `/crons`, `/settings`, `/agent-guide`
- **Nav** in `frontend/src/components/Nav.jsx` — horizontal tab bar with `<Link>` for each route
- **Page pattern**: All pages use `Header` component + `Nav` component + main content area with `max-w-7xl mx-auto`
- **WebSocket hook** at `frontend/src/hooks/useWebSocket.js` — connects to backend WS for state updates
- **AgentContext** at `frontend/src/context/AgentContext.jsx` — provides selected agent/provider config
- **apiBase** at `frontend/src/lib/apiBase.js` — resolves API base URL dynamically

### Backend Structure
- **FastAPI** backend in `backend/`, port 5056
- **Main entry**: `backend/main.py` — includes routers, CORS, WebSocket
- **Existing routers**: todos, cron, processes, jobs, system, hermes_sync, remote, settings
- **Pydantic models** at `backend/models/schemas.py`
- **WebSocket** at `backend/core/websocket.py`

### Pi Agent Configuration (External)
- `~/.pi/agent/auth.json` — has API keys for: opencode-go, deepseek, fireworks
- `~/.pi/agent/settings.json` — has `enabledModels` list with 13 models under `opencode-go/` provider
- The default model used in this project is `opencode-go/deepseek-v4-flash`
- Default provider from settings is "fireworks" but project uses opencode-go

### No Existing Chat Infrastructure
No chat routes, components, backend endpoints, or DB tables exist. Must be built from scratch.

## What to Build

### 1. Backend: Chat API (`backend/api/chat.py` + register in main.py)

Create a new FastAPI router at `backend/api/chat.py`:

**POST /chat** — Send a message to the PI agent LLM
- Request body: `{ "message": string, "provider": string, "model": string, "history": array, "attachments": array }`
- Calls the LLM via direct HTTP API using the opencode-go API
- Returns: `{ "role": "assistant", "content": string, "model": string }`

**GET /chat/models** — Returns available models with metadata
- Reads from `~/.pi/agent/settings.json` (enabledModels)
- Returns: `{ "models": [{ "id": string, "provider": string, "name": string, "pricing": { "input": number, "output": number }, "capabilities": ["text", "vision", "tools", "thinking"], "context_length": number }] }`
- Sorted by pricing (cheapest first)

**GET /chat/providers** — Returns available providers
- Reads from `~/.pi/agent/auth.json` keys
- Returns: `{ "providers": [{ "id": string, "name": string }] }`

### 2. Frontend: Chat Page (`frontend/src/pages/Chat.jsx`)

Create a full-featured chat page:

**Layout**
- `min-h-screen bg-slate-950` wrapper, `Header` + `Nav`, main content area
- Two-panel layout: left conversation sidebar, right chat area

**Provider/Model Selector** (top of chat area)
- Dropdown for provider
- Dropdown for model filtered by provider, sorted by price
- Each model shows: name, pricing, capabilities (Text, Vision, Tools, Thinking)
- Default: provider="opencode-go", model="deepseek-v4-flash"
- **Session persistence**: Remember model per conversation in localStorage

**Message Display**
- Chat bubbles: user right-aligned (blue), assistant left-aligned (slate)
- Show model name for each assistant response
- Support markdown rendering in messages (use react-markdown if available in package.json or a simple approach)
- "Thinking" indicator while waiting

**Input Area**
- Textarea that grows, send button
- **Attachment button**: file picker for images, PDFs, text files
- Shows attached files as chips above input with remove button
- **Media capability check**: Before sending, check model supports the media type. Show warning if not.
- Max 10MB per file, max 5 files per message

**Conversation History**
- Sidebar: list saved conversations with timestamp
- "New Chat" button at top
- Click to switch conversation
- Each conversation saves: messages, model/provider, timestamp
- Store in localStorage

### 3. Wire Into Navigation

**App.jsx** — Add route: `<Route path="/chat" element={<Chat />} />`
**Nav.jsx** — Add link: `<Link to="/chat">Chat</Link>`

### 4. Model Registry

Check for model registry at `/root/.pi/agent/`. If no external registry, embed a static one:

```python
MODEL_REGISTRY = {
    "opencode-go/deepseek-v4-flash": {"name": "DeepSeek V4 Flash", "provider": "opencode-go", "pricing": {"input": 0.15, "output": 0.60}, "capabilities": ["text", "vision", "tools"], "context": 128000},
    "opencode-go/deepseek-v4-pro": {"name": "DeepSeek V4 Pro", "provider": "opencode-go", "pricing": {"input": 0.50, "output": 2.00}, "capabilities": ["text", "vision", "tools", "thinking"], "context": 128000},
    # ... etc
}
```

## Implementation Steps (do these in order)

1. Read these files first:
   - `frontend/src/App.jsx`
   - `frontend/src/components/Nav.jsx`
   - `backend/main.py`
   - `backend/api/settings.py` (pattern for API)
   - `frontend/src/pages/AgentGuide.jsx` (page pattern)
   - `~/.pi/agent/settings.json`
   - `~/.pi/agent/auth.json`
   - Check for model registry files in `~/.pi/agent/`
   - `backend/api/remote.py` (for proxy patterns)
   - `frontend/src/lib/apiBase.js`
   - `frontend/src/context/AgentContext.jsx`
   - `frontend/src/hooks/useWebSocket.js`
   - `frontend/package.json` (check for existing markdown deps like react-markdown or marked)

2. Create backend/api/chat.py with the 3 endpoints

3. Register the router in backend/main.py

4. Create frontend/src/pages/Chat.jsx with full chat UI

5. Add route to frontend/src/App.jsx

6. Add tab to frontend/src/components/Nav.jsx

7. Add a `frontend/src/components/ChatMessage.jsx` component for individual message rendering with markdown support

8. Add a `frontend/src/components/AttachmentChip.jsx` component for attachment chips

9. If no markdown library exists in package.json, install react-markdown with `cd frontend && npm install react-markdown`

10. Build check:
    ```bash
    cd frontend && npx vite build 2>&1 | tail -30
    cd backend && python -c "import sys; sys.path.insert(0,'backend'); from api.chat import router; print('OK')" 2>&1
    ```

11. Commit and push:
    ```bash
    git add -A
    git commit -m "feat: add PI agent chat tab with provider/model selector and attachments"
    git push -u origin ticket/add-pi-agent-to-chat-tab-with-provider-m-555159
    ```

## Important

- **API Keys**: Read from `~/.pi/agent/auth.json` at runtime, do NOT hardcode
- **LLM Call**: Use direct HTTP API calls to the opencode-go API endpoint with API key from auth.json. Check what API base URL opencode-go uses (likely something like https://api.opencode-go.com or similar)
- **Models**: The model IDs in settings.json are like "opencode-go/deepseek-v4-flash" — the backend should map these to the API
- **For streaming**: Non-streaming is fine for the first version
- **Error handling**: Wrap LLM calls in try/except, return descriptive error messages
- **CORS**: Already wide open
- Write production-quality code with proper error handling and loading states


## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```