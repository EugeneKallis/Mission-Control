# Pi Agent Integration — Phased Plan

## Context

The `/chat` page in mission-control is a thin LLM wrapper — it POSTs messages to OpenAI/Anthropic directly and stores them in SQLite. It has no tool execution, no skills, no code sandbox. The user wants to replace this with a **full Pi instance** accessible from the web, giving access to all installed skills, tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`), extensions, and context files.

**Architecture:** Pi supports RPC mode (`pi --mode rpc`) — a JSONL protocol over stdin/stdout that exposes the full agent (tools, skills, model switching, compaction, streaming events). We'll spawn one Pi subprocess per session and bridge it to the browser using the existing SSE + POST pattern mission-control already uses for macro streaming.

```
Browser ←─SSE─→ /api/pi/events/[sessionId] ──stdout──→ pi --mode rpc
Browser ──POST→ /api/pi/command/[sessionId] ──stdin──→  pi --mode rpc
```

This follows the same pattern as the existing `/api/ws` SSE endpoint (the legacy
`/api/agent/events` agent SSE streams were removed with the remote-agent system).

---

## Phase 1: Pi Process Manager (server-side) ✅

**Goal:** Spawn and manage `pi --mode rpc` subprocesses from Next.js API routes.

**What to build:**
- `src/lib/pi/process-manager.ts` — singleton that spawns `pi --mode rpc` child processes, tracks them by session ID, pipes stdin/stdout, and cleans up on disconnect/timeout
- Reuse the `liveBus` pattern (`src/lib/live-bus.ts`) but per-session: a pub/sub bus that fans out Pi RPC events from stdout to SSE subscribers
- Spawn with `cwd` set to the mission-control project root by default — the user can switch cwd by asking the agent (e.g. "switch to the ~/projects/foo directory") which triggers a re-spawn with the new cwd. No cwd picker UI; the agent handles it.
- Pass `--tools` and `--exclude-tools` flags at spawn time based on the settings from Phase 2 (enabled/disabled tools). Pass `--no-skills` or `--skill` flags based on enabled/disabled skills.
- Process lifecycle: spawn on first connection, kill on disconnect after a grace period, respawn on reconnect
- No concurrent session limit — single user

**Files to create:**
- `src/lib/pi/process-manager.ts`
- `src/lib/pi/process-manager.test.ts`

**Reuse:**
- `src/lib/live-bus.ts` — pub/sub pattern (clone as per-session event bus)

**Verification:**
- Unit test: spawn a dummy process, verify stdin write + stdout read
- Manual: `curl` the SSE endpoint, see initial Pi RPC events stream

---

## Phase 2: Skills & Tools Settings Page ✅

**Goal:** A settings page where the user can enable/disable individual skills and tools. These choices are applied at spawn time (Phase 1 reads them before launching `pi --mode rpc`).

**What to build:**
- `src/app/api/pi/resources/route.ts` — discovers available skills and tools:
  - Skills: scan `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/` for `SKILL.md` files (reuse Pi's discovery rules)
  - Tools: the built-in tool list (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) plus any extension-registered tools (discoverable via `pi --mode rpc` `get_commands` or by parsing extensions)
  - GET returns the full catalog with enabled/disabled state; POST updates the persisted state
- `src/lib/pi/pi-settings.ts` — persisted settings store (JSON file in mission-control's data dir or a DB table) tracking which skills and tools are enabled. Defaults: all built-in tools enabled, all discovered skills enabled.
- `src/app/pi-settings/page.tsx` — settings page UI:
  - Tool list with toggle switches (each built-in tool + extension tools)
  - Skill list with toggle switches (name, description, source path)
  - These settings are read by the process manager at spawn time to construct the `--tools` / `--exclude-tools` / `--no-skills` / `--skill` CLI flags
- Nav: add a "Pi Settings" link in the Agent section of the sidebar (under Chat)

**Files to create:**
- `src/app/pi-settings/page.tsx`
- `src/app/api/pi/resources/route.ts`
- `src/app/api/pi/resources/route.test.ts`
- `src/lib/pi/pi-settings.ts`
- `src/lib/pi/pi-settings.test.ts`
- `src/components/pi-settings/pi-settings-page.tsx`

**Reuse:**
- `src/components/layout/sidebar-content.tsx` — add nav item in Agent section
- `src/components/ui/modal.tsx` — toggle UI pattern

**Verification:**
- Open `/pi-settings`, toggle off the `bash` tool, start a new chat — Pi spawns without `bash` and can't run shell commands
- Toggle a skill off, start a chat — that skill's `/skill:name` command is not available
- Toggle everything back on, verify full capability restored

---

## Phase 3: SSE Event Stream Endpoint ✅

**Goal:** Browser can connect to an SSE stream that relays Pi RPC events.

**What to build:**
- `src/app/api/pi/events/[sessionId]/route.ts` — SSE endpoint (GET) that subscribes to the process manager's event bus for the given session ID and streams Pi RPC JSONL events to the browser as SSE `data:` lines
- Follow the exact pattern of `src/app/api/ws/route.ts` (ReadableStream + writeSSE + keepalive)
- On connect: ensure the Pi subprocess is running (spawn if needed), subscribe to its event bus
- On disconnect: unsubscribe, schedule process cleanup after grace period

**Files to create:**
- `src/app/api/pi/events/[sessionId]/route.ts`
- `src/app/api/pi/events/[sessionId]/route.test.ts`

**Reuse:**
- `src/app/api/ws/route.ts` — SSE endpoint pattern (writeSSE, keepalive, signal cleanup)

**Verification:**
- Connect via `curl -N /api/pi/events/test-session`, see `agent_start` or session init events
- Disconnect, verify cleanup

---

## Phase 4: POST Command Endpoint ✅

**Goal:** Browser can send commands (prompt, abort, steer) to the Pi subprocess.

**What to build:**
- `src/app/api/pi/command/[sessionId]/route.ts` — POST endpoint that accepts a JSON body and writes it as a JSONL line to the Pi subprocess's stdin
- Support commands: `prompt`, `abort`, `steer`, `follow_up`
- Returns 200 on write success (the actual response comes asynchronously via the SSE event stream)
- Error if process not running or sessionId unknown

**Files to create:**
- `src/app/api/pi/command/[sessionId]/route.ts`
- `src/app/api/pi/command/[sessionId]/route.test.ts`

**Verification:**
- POST a prompt command, see `agent_start` → `message_update` (text deltas) → `agent_end` on the SSE stream

---

## Phase 5: New Chat UI — Streaming Messages + Skill Autocomplete ✅

**Goal:** Replace the current ChatPage with a Pi-powered chat that shows streaming assistant text, slash-command autocomplete, and visibility into enabled skills/tools.

**What to build:**
- `src/components/pi-chat/pi-chat-page.tsx` — new chat component, replaces old ChatPage entirely
- SSE hook: `src/hooks/use-pi-stream.ts` — connects to `/api/pi/events/[sessionId]`, parses incoming JSONL events, exposes them as React state
- Event handlers for `message_update` (text_delta) → append to streaming assistant message
- Event handlers for `agent_start`, `agent_end`, `agent_settled` → streaming state indicators
- Message input + send → POST to `/api/pi/command/[sessionId]`
- **Slash-command autocomplete:** when the user types `/` in the input, show a dropdown of available skills (`/skill:name`) and prompt templates (`/templatename`). Populate from the enabled skills/tools settings (Phase 2) and the RPC `get_commands` response. Filter as the user types. Enter or click sends the selected command as a prompt.
- **Enabled skills & tools dropdowns:** in the chat header, show small dropdown menus listing the currently enabled skills and tools. Read-only displays of the Phase 2 settings — just for visibility ("what does this session have access to?")
- **Working directory indicator:** show the current `cwd` somewhere small but visible — e.g. a monospace text in the header or status bar like `cwd: /opt/mission-control`. Updates when the agent switches directories.
- Update `src/app/chat/page.tsx` to render `<PiChatPage />` instead of `<ChatPage />`

**Files to create:**
- `src/components/pi-chat/pi-chat-page.tsx`
- `src/components/pi-chat/slash-autocomplete.tsx`
- `src/components/pi-chat/skills-tools-dropdowns.tsx`
- `src/hooks/use-pi-stream.ts`
- `src/lib/pi/event-types.ts` — TypeScript types for Pi RPC events (mirrors the RPC protocol)

**Reuse:**
- `src/components/chat/chat-page.tsx` — layout structure, sidebar, input bar, attachment handling
- `src/hooks/use-live-stream.ts` — EventSource hook pattern

**Verification:**
- Open `/chat`, type a message, see streaming response appear token-by-token
- Agent uses tools (e.g. `bash ls`) and the response completes
- Type `/` in the input — see autocomplete dropdown with available skills
- Header shows enabled skills/tools dropdowns and cwd indicator

---

## Phase 6: Tool Call Rendering ✅

**Goal:** Show tool calls and their results inline in the chat.

**What to build:**
- Event handlers for `tool_execution_start` → render a tool call card (tool name + args)
- Event handlers for `tool_execution_update` → stream partial output into the card
- Event handlers for `tool_execution_end` → finalize the card with full result + error/success indicator
- Collapsible tool call sections (expandable/collapsible)
- Special rendering per tool type:
  - `bash` → terminal-style output block
  - `read` → file path + truncated content
  - `edit` → diff-style rendering (unified patch)
  - `write` → file path + creation indicator

**Files created:**
- `src/components/pi-chat/tool-call-card.tsx` — extracted from pi-chat-page.tsx, delegates to per-tool renderers
- `src/components/pi-chat/tool-result-renderers.tsx` — per-tool rendering helpers (bash→terminal, read→file preview, edit→diff, write→creation indicator)
- `src/components/pi-chat/tool-call-card.test.tsx` — 13 tests
- `src/components/pi-chat/tool-result-renderers.test.tsx` — 20 tests

**Verification:**
- Ask Pi "list files in src/" — see a `bash` tool call card with `ls` output streaming in
- Ask Pi "read the package.json" — see a `read` tool card with file content

---

## Phase 7: Model & Settings Controls ✅

**Goal:** Let the user switch models, set thinking level, and see session stats from the web UI.

**What was built:**
- `PiSession.sendAndWait()` — send RPC command + await response events (added to `process-manager.ts`)
- `PUT /api/pi/state/[sessionId]` — set model (`modelId` + `provider`) and thinking level via RPC `set_model` / `set_thinking_level`
- `GET /api/pi/state/[sessionId]` — fetch available models (`get_available_models`), session stats (`get_session_stats`), and session state (`get_state`) via RPC
- Model selector modal (populated from Pi's model registry, search + provider filter, capability chips, ready/needs-key badges)
- Thinking level dropdown (off/minimal/low/medium/high with descriptions)
- Status bar in chat header: model label (clickable → opens selector), thinking level, context usage bar with color coding, message count, refresh button
- `RpcResponse` added to `PiEvent` union type so response events flow through the event bus

**Files created:**
| File | Purpose |
|------|---------|
| `src/components/pi-chat/model-selector.tsx` | Model selection modal with search + provider filter |
| `src/components/pi-chat/model-selector.test.tsx` | 8 tests |
| `src/components/pi-chat/status-bar.tsx` | Status bar: model, thinking, context, stats |
| `src/components/pi-chat/status-bar.test.tsx` | 8 tests |
| `src/app/api/pi/state/[sessionId]/route.ts` | GET available models/stats, PUT model/thinking |
| `src/app/api/pi/state/[sessionId]/route.test.ts` | 11 tests |

**Files modified:**
| File | Change |
|------|--------|
| `src/lib/pi/event-types.ts` | Added `RpcResponseSuccess | RpcResponseError` to `PiEvent` union |
| `src/lib/pi/process-manager.ts` | Added `sendAndWait()` method; imported `RpcResponse` |
| `src/components/pi-chat/pi-chat-page.tsx` | Integrated `ModelSelector` + `StatusBar` in header |

**27 new tests + 1325 total passing.**

**Verification:**
- Model selector opens, lists Pi's available models, highlights active model, switches on click
- Thinking level dropdown opens, shows all options with descriptions, calls `set_thinking_level`
- Status bar fetches state on mount, shows context usage bar with color coding
- All 8 StatusBar + 8 ModelSelector component tests + 11 API route tests pass

---

## Phase 8: Session Persistence & Management ✅

**Goal:** Persist Pi sessions, list past sessions, resume/branch them.

**What was built:**
- Pi sessions are persisted automatically: `--session <path>` is passed on spawn, storing session data in `~/.pi/agent/sessions/mc-<sessionId>/`
- `GET /api/pi/sessions` — scans `~/.pi/agent/sessions/` and lists session directories with metadata (name, messageCount, lastModified)
- `POST /api/pi/sessions` — set a custom name for a session (saved to `name.txt`)
- `DELETE /api/pi/sessions/[id]` — delete a session directory (path-traversal sanitized)
- Session sidebar (`SessionSidebar`): 240px collapsible panel within the PiChatPage, showing sessions sorted newest-first with relative timestamps, rename/delete actions on hover
- Session switching: clicking an inactive session sends `switch_session` RPC to Pi
- Header toggle button to open/close the sidebar

**Files created/modified:**
| File | Purpose |
|------|---------|
| `src/app/api/pi/sessions/route.ts` | GET list + POST rename sessions |
| `src/app/api/pi/sessions/route.test.ts` | 7 tests |
| `src/app/api/pi/sessions/[id]/route.ts` | DELETE session (path-safe) |
| `src/app/api/pi/sessions/[id]/route.test.ts` | 3 tests |
| `src/components/pi-chat/session-sidebar.tsx` | Collapsible session list panel |
| `src/components/pi-chat/session-sidebar.test.tsx` | 11 tests |
| `src/components/pi-chat/pi-chat-page.tsx` | MODIFIED — integrated sidebar + session switch handlers |
| `src/lib/pi/process-manager.ts` | MODIFIED — default session path on spawn; `mkdirSync` for sessions dir |

**21 new tests + 1346 total passing.**

**Verification:**
- Sidebar opens via header toggle, lists persisted sessions from disk
- Active session highlighted with check_circle
- Click inactive session → calls `switch_session` RPC, clears local messages
- Rename and delete actions available on hover
- Pi spawns with `--session` for persistence
- Path-traversal prevented on all session ID inputs

---

## Phase 9: Cleanup & Migration ✅

**Goal:** Remove the old simple-chat infrastructure entirely. The Pi chat replaces it.

**What was done:**
- Deleted `src/app/api/chat/` — 4 route files (models, sessions, [id], messages) + 4 test files
- Deleted `src/lib/chat/` — provider.ts, models.ts, keys.ts + 3 test files (67 tests total)
- Deleted `src/components/chat/` — chat-page.tsx, chat-types.ts + 1 test file
- Removed old chat queries from `src/lib/db/queries.ts` — `ChatAttachmentMeta`, `listChatSessions`, `getChatSession`, `createChatSession`, `updateChatSession`, `touchChatSession`, `deleteChatSession`, `addChatMessage` + `DEFAULT_MODEL_ID` import
- Removed `ChatSession` and `ChatMessage` models from Prisma schema
- Created migration `20260714000000_drop_chat_tables` — drops `chat_messages` and `chat_sessions` tables
- Updated sidebar: "Chat" → "Pi Agent" with `smart_toy` icon
- Fixed pre-existing unclosed `<div>` in `pi-chat-page.tsx`

---

## Resolved Decisions

1. **Session model:** One Pi subprocess per browser session. Pi is lightweight. (confirmed ✓)
2. **Working directory:** Default to mission-control project root. User can switch by asking the agent (e.g. "switch to ~/projects/foo"). Show cwd in the chat header — small but visible. (confirmed ✓)
3. **Old chat:** Fully replaced and removed. No fallback. (confirmed ✓)
4. **Authentication:** No auth, fully internal. Pi subprocess inherits server env vars. (confirmed ✓)
5. **Concurrent sessions:** No limit — only one user. (confirmed ✓)
6. **Skills/tools management:** Settings page (Phase 2) controls which skills/tools are enabled. Applied at spawn time via CLI flags. Chat UI shows enabled skills/tools as dropdowns and provides slash-command autocomplete. (confirmed ✓)