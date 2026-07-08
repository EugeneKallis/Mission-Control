# Codebase Context: Mission Control Dashboard

## 1. Project Structure

```
/root/pi-kanban/state/clones/t1783538555159/
├── .git/                         # Git repo
├── .gitignore                    # Ignores node_modules, dist, __pycache__
├── .heartbeat                    # Timestamp file (untracked)
├── .pi-subagents/                # Pi subagent artifacts (untracked)
├── .woodpecker/
│   ├── dev-deploy.yml
│   └── prod-deploy.yml
├── README.md                     # Project readme
├── backend/                      # Python FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                   # FastAPI entry point (port 5056)
│   ├── api/                      # Route modules
│   │   ├── __init__.py
│   │   ├── cron.py
│   │   ├── hermes_sync.py
│   │   ├── jobs.py
│   │   ├── processes.py
│   │   ├── remote.py             # Remote gateway proxy
│   │   ├── settings.py           # Agent settings CRUD
│   │   ├── system.py
│   │   └── todos.py
│   ├── core/
│   │   ├── state.py              # Singleton state + SQLite persistence
│   │   └── websocket.py          # WebSocket broadcast manager
│   ├── models/
│   │   └── schemas.py            # Pydantic models
│   └── tests/
├── docker-compose.yml            # Backend (5056) + Frontend (3000)
├── frontend/                     # React SPA (Vite + Tailwind)
│   ├── Dockerfile
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   ├── package-lock.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx               # React Router setup (5 routes)
│       ├── main.jsx              # Entry point with AgentProvider
│       ├── index.css
│       ├── components/           # 12 reusable components
│       ├── context/
│       │   └── AgentContext.jsx  # Agent/provider config context
│       ├── hooks/
│       │   └── useWebSocket.js   # WebSocket + polling hook
│       ├── lib/
│       │   └── apiBase.js        # Dynamic API base URL resolver
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Kanban.jsx
│       │   ├── Crons.jsx
│       │   ├── Settings.jsx
│       │   ├── AgentGuide.jsx
│       │   └── Tasks.jsx         # Exists but NOT wired in App.jsx
│       └── test/
│           └── setup.js
├── hermes_integration.py
├── requirements.txt
├── start.sh
├── sync-bridge.py
└── templates/
```

## 2. Frontend App Structure

### Current Tab Navigation (App.jsx lines 1-22)

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Crons from './pages/Crons'
import Kanban from './pages/Kanban'
import Settings from './pages/Settings'
import AgentGuide from './pages/AgentGuide'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/crons" element={<Crons />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/agent-guide" element={<AgentGuide />} />
      </Routes>
    </BrowserRouter>
  )
}
```

### Tab Navigation Component (Nav.jsx lines 1-36)

Renders a horizontal `<nav>` bar with `<Link>` items for each route. Active route gets `bg-blue-600 text-white`, inactive gets `text-slate-400 hover:text-white hover:bg-slate-800`. Current links:

| Route | Label |
|-------|-------|
| `/` | Overview |
| `/kanban` | Kanban |
| `/crons` | Crons |
| `/settings` | Settings |
| `/agent-guide` | Guide |

Nav also has an optional `rightContent` prop slot used for `AgentScopePicker` on Dashboard.

### Page Template Pattern

Every page follows the same pattern:
1. Import `useWebSocket` and/or `useAgentContext`
2. Import `Nav` and `Header` components
3. Render: `<div className="min-h-screen bg-slate-950">`
4. `<Header connected={...} lastUpdate={...} now={now} />`
5. `<main>` with `max-w-7xl mx-auto px-4 py-6`
6. `<Nav />` inside a `<div className="mb-6">` wrapper

### Existing Pages (What They Do)

- **Dashboard** (`/`): Overview with stat cards, cron/process/widgets, activity timeline, quick actions
- **Kanban** (`/kanban`): Full kanban board with columns, task CRUD, agent assignment
- **Crons** (`/crons`): Cron job list with run/pause/edit controls
- **Settings** (`/settings`): Agent configuration (add/edit/remove agents, URL settings)
- **AgentGuide** (`/agent-guide`): Prompt builder / agent guide content
- **Tasks** (`/tasks`): Tasks list page (fully implemented but **NOT imported in App.jsx** — it's dormant code)

### Key Dependencies (package.json)

- `react` 18.2, `react-dom` 18.2
- `react-router-dom` 7.14 (for tab/page routing)
- `recharts` 2.12 (for dashboard charts)
- Dev: Vite 5, Tailwind 3.4, Vitest 2.1, Testing Library

## 3. Backend Structure

### Main entry (backend/main.py lines 1-88)

- FastAPI app on port 5056
- CORS wide open (allow_origins=["*"])
- **Routers included**: todos, cron, processes, jobs, system, hermes_sync, remote, settings
- Each router mounted at both root prefix and `/api` prefix (for k8s ingress)
- WebSocket endpoint at `/ws`
- Health check at `/health` and `/api/health`
- Full state endpoint at `/state` and `/api/state`
- SQLite persistence via `core/state.py`

### Current API Routes

| Route | Module | Description |
|-------|--------|-------------|
| `GET /state` `GET /api/state` | state | Full dashboard state |
| `GET /health`, `/api/health` | main | Health check |
| `WS /ws` | websocket | WebSocket for real-time updates |
| `/todos/*` | api/todos.py | Task CRUD |
| `/cron/*` | api/cron.py | Cron job management |
| `/processes/*` | api/processes.py | Process list |
| `/jobs/*` | api/jobs.py | Job search stats |
| `/system/*` | api/system.py | System stats |
| `/hermes/*` | api/hermes_sync.py | Hermes data push |
| `/remote/*` | api/remote.py | Remote gateway proxy |
| `/settings/*` | api/settings.py | Agent settings CRUD |

### Agent Settings API (backend/api/settings.py)

```python
@router.get("/agents")         # GET /settings/agents
@router.put("/agents")         # PUT /settings/agents - saves agent list + selected_agent_id
```

Stores agent config (id, name, url) via `core/state.py` persistence.

### Pydantic Models (backend/models/schemas.py)

Key types: `TodoItem`, `CronJob`, `ProcessInfo`, `JobSearchStats`, `SystemStats`, `ActivityEvent`, `AgentConfig`, `AgentSettingsResponse`, `DashboardStateResponse`

### WebSocket (backend/core/websocket.py)

- `ConnectionManager` class with `connect`, `disconnect`, `broadcast`, `broadcast_state_change`
- `handle_websocket` handler: accepts connection, handles "ping", "refresh", "log_event" message types
- Sends `state_full` on connect

## 4. Git Branch Status

- **Current branch**: `ticket/add-pi-agent-to-chat-tab-with-provider-m-555159` (checked out)
- **Branch exists**: locally and tracks `origin/develop`
- **Upstream branches**: `main` (prod), `develop` (staging), `ticket/add-pi-agent-to-chat-tab-with-provider-m-555159` (current)
- **Status**: The branch currently points to `origin/main` (no commits ahead yet). The diff shows 409 files changed compared to main — this is because this branch was branched from `develop` and the diff is compared to `main`. The actual branch has **no committed changes** beyond what's in `develop`.
- **Working tree**: Clean except for untracked `.heartbeat` and `.pi-subagents/`

## 5. Pi Agent Configuration (`~/.pi/agent/`)

### Auth Registry (`auth.json`)

```json
{
  "opencode-go": {
    "type": "api_key",
    "key": "sk-X46LLTEGAIkn7lUajGndGL2Msun1AiMmpIfRiNa9EjHRDRJ8kaKqpntqO3NVyDGT"
  },
  "deepseek": {
    "type": "api_key",
    "key": "sk-d4d01681391d4e2f8713e04bf0cf15c9"
  },
  "fireworks": {
    "type": "api_key",
    "key": "fw_K8crTQk2Kd4UdprLdKUHw2"
  }
}
```

### Settings (`settings.json`)

```json
{
  "defaultProvider": "fireworks",
  "defaultModel": "accounts/fireworks/models/deepseek-v4-flash",
  "defaultThinkingLevel": "high",
  "enabledModels": [
    "opencode-go/deepseek-v4-flash",
    "opencode-go/deepseek-v4-pro",
    "opencode-go/qwen3.7-plus",
    "opencode-go/qwen3.7-max",
    "opencode-go/qwen3.6-plus",
    "opencode-go/minimax-m3",
    "opencode-go/minimax-m2.7",
    "opencode-go/mimo-v2.5-pro",
    "opencode-go/mimo-v2.5",
    "opencode-go/kimi-k2.7-code",
    "opencode-go/kimi-k2.6",
    "opencode-go/glm-5.2",
    "opencode-go/glm-5.1"
  ]
}
```

All three API keys (opencode-go, deepseek, fireworks) are present. Default model is deepseek-v4-flash via fireworks/open-code-go.

### OpenCode Subscriptions (`opencode-subs.json`)

Has two workspaces: `personal` and `backup`, each with API keys and auth cookies.

## 6. Chat / Messaging Infrastructure

**There is NO existing Chat infrastructure in the current codebase.** The old Next.js codebase (which was replaced) had a `src/app/chat/page.tsx` and `src/components/chat/` directory, but those were removed in the rewrite. The current codebase:

- No "Chat" route exists in App.jsx
- No "Chat" tab/link in Nav.jsx
- No chat-related components anywhere in frontend/src/
- No chat-related API routes in backend/
- No WebSocket message types for chat (only "ping", "refresh", "log_event")
- No database tables or models for chat

The `Tasks.jsx` page exists as dormant code but is unrelated to chat — it's a tasks tracker view that was never wired into the router.

## 7. Tab Navigation Pattern

Tabs are implemented via **React Router** with `<Link>` components in `Nav.jsx`. The pattern is:

1. Add a `<Route>` in `App.jsx` for the new page
2. Add a `<Link>` in `Nav.jsx` with the route path
3. Create the page component in `src/pages/`

All pages share the same wrapper pattern (Header + Nav + main content area). The Nav uses `useLocation()` to determine active state. The AgentScopePicker is passed as `rightContent` prop to Nav only on Dashboard.

## 8. Key Findings & Constraints

- **No chat infrastructure exists** — needs to be built from scratch
- **Tab pattern is straightforward**: add Route to App.jsx + add Link to Nav.jsx
- **Pi agent auth** is available (fireworks, opencode-go, deepseek keys) and can be used for an LLM-powered chat
- **WebSocket** infrastructure exists but only for state broadcasting, not for chat — would need to be extended or a separate mechanism
- **Agent settings API** can store/retrieve provider configs — could be extended for chat provider/model settings
- **Tasks.jsx** is dormant but demonstrates the page template pattern
- The branch `ticket/add-pi-agent-to-chat-tab-with-provider-m-555159` is clean with no commits yet — ready for implementation

## Start Here

**`frontend/src/App.jsx`** — This is the routing entry point where the new Chat tab route needs to be added. Follow the existing pattern of imports + Route element. Then add the tab link in `frontend/src/components/Nav.jsx`. Create the Chat page in `frontend/src/pages/` with a similarly structured component. The backend Chat API would go in `backend/api/` with a new router module, registered in `backend/main.py`.