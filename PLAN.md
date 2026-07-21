# Scheduled Agent Tasks — Plan

> **Living document.** Agents working on this feature update the Progress table and mark their phase ✅ as they go. When the whole feature is done, update `AGENTS.md` (Phase Tracker + new section) and the completion table here.

## Goal

Add a **Scheduled Agent Tasks** capability under the sidebar's **Agent** section. Each task stores a cron frequency + a prompt + per-task enabled/disabled tools & skills. The in-process scheduler spawns the Pi CLI in **headless print+JSON mode** (`pi -p "<prompt>" --mode json …`) on the cron, runs it to completion, and captures *everything the agent does* (assistant text, tool calls + results, errors) as a transcript. That transcript surfaces in the **Log tab** (new "Agent Tasks" service) and per-run in the **History tab**, and contributes to the Log Viewer error badge.

The agent is told (via `--append-system-prompt`) that it is headless, running unattended on a cron, must not expect user interaction, must not halt on prompts, and must complete the task autonomously.

## Design decisions (and why)

- **Print mode (`-p`) + `--mode json`, not the RPC singleton.** The existing `piProcessManager` is a single shared interactive chat session — wrong for isolated cron runs. Print+JSON mode is non-interactive, exits on completion, and emits every event (agent/turn/message/tool) as JSON lines we can render. Print mode does *not* emit `extension_ui_request` blocking events, so nothing can hang waiting for a human.
- **Per-task tools/skills override.** Reuse `PiSpawnOptions` building logic from `pi-settings.ts`, but stored per-task (not global). Allowlist `--tools`, denylist `--exclude-tools`, skills `--skill`/`--no-skills` — exactly the flags already supported by pi.
- **Headless directive via `--append-system-prompt`** (not `--system-prompt`, so default context/skills stay intact). Mirrors how pi appends skill context.
- **History table for runs.** Reuse the existing `History` model + `createHistory`/`updateHistory`/`flushHistoryOutput` (Phase 9 incremental flush) by adding an `agentTaskId` relation. History detail page already renders `output`.
- **Log tab integration.** `/api/logs` currently only shells out to `journalctl`. Add a DB-backed branch for `service=agent-tasks` that renders recent agent-task run transcripts. Add the button to `logs/page.tsx` and add `agent-tasks` to `log-alerts` aggregation so agent errors count toward the badge.
- **Scheduler mirrors `worker-timer-scheduler.ts`** (same `cron` package, same `init/addTimer/removeTimer/updateTimer/stopAll` shape, creates a History row, flushes output, finalizes on exit/timeout).
- **Overlap guard:** in-memory `Set<taskId>` of currently-running tasks to skip a tick if the previous run is still going.

## Risks / edge cases

- **Dangerous tools run auto-approved in print mode.** Safety lever = per-task tool allowlist (defaults to a safe non-mutating set: `read, grep, find, ls`). Mutating tools (`bash, edit, write`) require the user to explicitly enable them per task. Document in AGENTS.md.
- **Transcript size.** Cap stored `History.output` at ~200 KB (tail) per run; add a cleanup that prunes agent-task history beyond N runs/task (default 50) — mirror `cleanOldScrapeResults` pattern.
- **Run timeout.** Default 5 min (matches Phase 6 agent command timeout). On timeout: SIGTERM → 5s → SIGKILL, finalize history as `error` with "timed out after Ns".
- **Project trust prompt.** Pass `-a`/`--approve` so print mode doesn't block on project-trust.
- **Session persistence.** Default `--no-session` (stateless, predictable). Optional per-task `persistSession` toggle using a dedicated path `~/.pi/agent/sessions/mc-scheduled/<taskSlug>.jsonl`.
- **`pi` not installed / not found.** Reuse `getPiPath()` resolution from `process-manager.ts`. Surface a clear `lastStatus: "error"` with the "pi binary not found" message.

## Progress table (agents update this as they go)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 — DB & types | Prisma `AgentTask` model, `History.agentTaskId` relation, migration, queries | ✅ Done |
| Phase 1 — Headless core | `headless-prompt.ts`, `json-event-renderer.ts`, shared `pi-path.ts`; unit tests | ✅ Done |
| Phase 2 — Scheduler | `agent-task-scheduler.ts` (spawn/json/timeout/overlap-guard) + instrumentation; lifecycle tests | ✅ Done |
| Phase 3 — API routes | `/api/agent-tasks/*` (list/create/get/update/delete/toggle/run-now/resources) + route tests | ✅ Done |
| Phase 4 — UI | `/agent-tasks` page + components (list, form w/ cron builder, tools/skills toggles, runs) + component tests | ✅ Done |
| Phase 5 — Log tab integration | `/api/logs` DB branch for `agent-tasks`, logs page button, log-alerts aggregation + tests | ✅ Done |
| Phase 6 — Docs & polish | AGENTS.md phase entry, this PLAN completion, sidebar nav item, manual smoke test | ✅ Done |

---

## Phase 0 — DB & types

**Files to create/modify:**
- `prisma/schema.prisma` — add `AgentTask` model + `agentTaskId` on `History`.
- `prisma/migrations/<timestamp>_add_agent_tasks/migration.sql` — new migration.
- `src/lib/db/queries.ts` — add `listAgentTasks`, `getAgentTask`, `createAgentTask`, `updateAgentTask`, `toggleAgentTask`, `deleteAgentTask`, `updateAgentTaskRunStatus`, `getRecentAgentTaskHistory(taskId?, limit)`, `cleanOldAgentTaskHistory(taskId, keep)`.
- `src/lib/db/queries.test.ts` (extend) — idempotent create, toggle, run-status update, history linkage + cleanup using `makeTestDB()`.

**Model shape:**

```prisma
model AgentTask {
  id              Int       @id @default(autoincrement())
  name            String
  prompt          String
  cronExpression  String    @map("cron_expression")
  enabled         Boolean   @default(false)
  provider        String?
  model           String?
  thinkingLevel   String?   @map("thinking_level")   // "off".."max"
  enabledTools    String?   @map("enabled_tools")    // JSON string[] allowlist; null = all (minus disabled)
  disabledTools   String?   @map("disabled_tools")   // JSON string[] denylist
  enabledSkills   String?   @map("enabled_skills")   // JSON string[] allowlist; null = default
  noSkills        Boolean   @default(false)          @map("no_skills")
  appendSystem    String?   @map("append_system")    // extra system-prompt append
  persistSession  Boolean   @default(false)          @map("persist_session")
  timeoutSec      Int       @default(300)           @map("timeout_sec")
  lastRunAt       DateTime? @map("last_run_at")
  lastStatus      String?   @map("last_status")
  createdAt       DateTime  @default(now()) @map("created_at")
  history         History[]

  @@map("agent_tasks")
}
```

`History` gains `agentTaskId Int? @map("agent_task_id")` + relation with `onDelete: SetNull`.

**Acceptance:** `just typecheck` green; migration applies on `makeTestDB()` (update the init-migration reference in `test-helpers.ts` to point at the latest migration OR apply this new migration on top — confirm against existing test-helpers pattern).

**When done:** set Phase 0 row to ✅, commit as `feat(agent-tasks): phase 0 — db model + queries`.

---

## Phase 1 — Headless core (pure helpers + tests)

**Files:**
- `src/lib/pi/pi-path.ts` — extract `getPiPath()` from `process-manager.ts` into a shared, exported helper (import back into process-manager so no dup). Add `resolvePiPathSync()`.
- `src/lib/pi/headless-prompt.ts` — pure:
  - `HEADLESS_SYSTEM_APPEND` constant (the "you are running headless on a cron…" directive).
  - `buildFullPrompt(task): string` (combines user prompt; optionally prepended directive if user wants it in the user message too).
  - `buildAgentTaskSpawnArgs(task): string[]` (pure) → returns argv: `["-p", prompt, "--mode", "json", "-a", "--append-system-prompt", headlessAppend + (task.appendSystem ?? ""), "--no-session" | "--session", "--tools", ..., "--exclude-tools", ..., "--skill", ..., "--no-skills", "--provider", ..., "--model", ..., "--thinking", ...]`. Reuse flag logic from `process-manager.ts` `buildArgs`.
- `src/lib/pi/json-event-renderer.ts` — pure `renderJsonEvent(event): string | null` mapping each JSON event type to readable log line(s): `agent_start/turn_start/turn_end/agent_end`, text deltas (folded), `tool_execution_start/end` (tool name + args short summary + result truncation + isError), `message_end` final assistant text, `compaction_*`, `auto_retry_*`. Returns a transcript-appending string or null to skip.
- Tests: `headless-prompt.test.ts` (argv shape for allowlist/denylist/skills/no-skills/persist/model/thinking combos; headless append always present), `json-event-renderer.test.ts` (one test per event type incl. error tool result + truncation).

**Acceptance:** 100% pure, no DB/spawn; `just test` green.

**When done:** set Phase 1 row to ✅, commit as `feat(agent-tasks): phase 1 — headless core + renderer`.

---

## Phase 2 — Scheduler

**Files:**
- `src/lib/agent-task-scheduler.ts` — `AgentTaskScheduler` class (mirrors `WorkerTimerScheduler`):
  - `jobs: Map<number, CronJob>`, `running: Set<number>`.
  - `init()` — load enabled tasks, register jobs.
  - `addTask(id)`, `removeTask(id)`, `updateTask(id, …)`, `stopAll()`.
  - `runNow(id)` — run a task immediately regardless of schedule (used by "Run now" button); reuses `runOnce`.
  - `runOnce(task)` — guard overlap; build args via `buildAgentTaskSpawnArgs`; `createHistory({ agentTaskId, status:"running", triggeredBy:"schedule" })`; `spawn(getPiPath(), args)` with `stdio:["ignore","pipe","pipe"]`; parse stdout line-by-line as JSON, append `renderJsonEvent` output to a growing transcript buffer; flush to `History.output` every 1.5s via `flushHistoryOutput` (dirty flag, like Phase 9); on `agent_end`/exit/timeout finalize: `updateHistory({endTime, status, output: tail.slice(-CAP)})`, `updateAgentTaskRunStatus(id, status)`, `cleanOldAgentTaskHistory(id, 50)`. Timeout via `setTimeout` + SIGTERM→SIGKILL.
- `src/instrumentation.ts` — add `agentTaskScheduler.init()` after `workerTimerScheduler.init()`.
- Tests: `agent-task-scheduler.test.ts` — lifecycle (init/add/update/remove/stopAll) with `CronJob` mocked; `runOnce` with a fake child process (stub `spawn`) emitting JSON lines, assert history create/flush/finalize + run-status update + overlap skip + timeout path. Reuse `makeTestDB()`.

**Acceptance:** `just test` green; scheduler logs `[agent-task] Running <name>…`.

**When done:** set Phase 2 row to ✅, commit as `feat(agent-tasks): phase 2 — scheduler + instrumentation`.

---

## Phase 3 — API routes

Mirror `/api/schedules/timers/*` (zod validation, scheduler hook calls).

**Files:**
- `src/app/api/agent-tasks/route.ts` — `GET` list (+ resource state: tools/skills catalog via `getResourceState` shapes, reusable for the form toggles), `POST` create.
- `src/app/api/agent-tasks/[id]/route.ts` — `GET`, `PUT` (update prompt/cron/tools/skills/model/timeout/etc.), `DELETE` (+ scheduler `removeTask`).
- `src/app/api/agent-tasks/[id]/toggle/route.ts` — `POST` toggle enabled → scheduler `updateTask`.
- `src/app/api/agent-tasks/[id]/run/route.ts` — `POST` run-now → scheduler `runNow` (returns 202 + history id).
- `src/app/api/agent-tasks/[id]/runs/route.ts` — `GET` recent run history for the task (for the UI "runs" panel).
- `src/app/api/agent-tasks/resources/route.ts` — `GET` returns available tools + skills (lightweight wrapper over `getAllTools()` + `discoverSkills()`) so the form can render toggles without hitting the global `/api/pi/resources` (keeps per-task UX independent of global disabled state).
- Tests: one `route.test.ts` per route, mirroring the timers tests (import handler, `NextRequest` from `@/test-utils/route-helpers`, mock DB via `makeTestDB()`, mock scheduler module).

**Validation:** `cronExpression` via `validateCronExpression` from `src/lib/cron.ts`; prompt non-empty; tool/skill names must exist in catalog (reject unknown to avoid silent `--tools` typos).

**Acceptance:** all routes return correct status codes; scheduler hooks called on create/toggle/update/delete/run.

**When done:** set Phase 3 row to ✅, commit as `feat(agent-tasks): phase 3 — api routes`.

---

## Phase 4 — UI

**Files:**
- `src/app/agent-tasks/page.tsx` — shell rendering `<AgentTasksPage />`.
- `src/components/agent-tasks/agent-tasks-page.tsx` — list of task cards (name, cron summary, enabled toggle, last run, last status, Run now, Edit, Delete) + "New Task" card.
- `src/components/agent-tasks/agent-task-form.tsx` — form: name, prompt textarea, cron builder (reuse the three-shape pattern from `src/components/schedules/*` + `src/lib/cron.ts` `buildCronExpression`/`parseCronToForm`), model+provider+thinking (reuse `model-selector.tsx` registry call shape), timeout, persistSession, appendSystem, **tools toggles** (list from `/api/agent-tasks/resources`, default-safe = non-mutating enabled), **skills toggles**. Submit → POST/PUT.
- `src/components/agent-tasks/agent-task-runs.tsx` — collapsible recent-runs panel per task (polls `/api/agent-tasks/[id]/runs` every 5s while status=running).
- `src/components/agent-tasks/agent-task-types.ts` — shared TS types.
- `src/components/layout/sidebar-content.tsx` — add `<NavItem label="Scheduled Tasks" icon="schedule_send" href="/agent-tasks" color="primary" badge={agentTaskErrorCount ?? undefined} badgeTitle="agent errors" />` in the Agent section, between **Pi Agent** and **Pi Settings**.
- Tests: `agent-tasks-page.test.tsx`, `agent-task-form.test.tsx` (render, toggle tool, build cron, submit payload), `agent-task-runs.test.tsx`. Use `@/test-utils/render`.

**Acceptance:** full CRUD flows; toggling a dangerous tool warns; cron expression round-trips via `parseCronToForm`.

**When done:** set Phase 4 row to ✅, commit as `feat(agent-tasks): phase 4 — ui page + form + sidebar`.

---

## Phase 5 — Log tab integration

**Files:**
- `src/app/api/logs/route.ts` — when `service === "agent-tasks"` (or `agent-task-<id>` via extra `task` param), skip journalctl and return DB-rendered text from `getRecentAgentTaskHistory(taskId, limit)` joined + formatted with run headers (`=== <taskName> — <startTime> — <status> ===` + transcript). Use the same `text/plain` response. Support `lines=all|N` to map to "recent N runs".
- `src/lib/log-alerts.ts` (server module — confirm filename; the client-safe re-exports) — add `agent-tasks` to `SERVICE_MAP` and an `agent-tasks` branch in `getAllLogAlertCounts()` that counts `isErrorLine` over recent agent-task transcripts (within the same watermark/7-day window). Add `countErrorsInAgentTaskHistory(sinceMs)`.
- `src/app/logs/page.tsx` — add `"agent-tasks": "Agent Tasks"` to `LABELS` and `SERVICES`.
- Tests: `src/app/api/logs/route.test.ts` add `agent-tasks` branch test (DB-backed, mocked); `log-alerts.test.ts` add agent-tasks error-count test.

**Acceptance:** selecting "Agent Tasks" in the Log tab shows the merged recent transcript; agent errors bump the sidebar badge; "Mark Resolved" watermark still applies.

**When done:** set Phase 5 row to ✅, commit as `feat(agent-tasks): phase 5 — log tab integration`.

---

## Phase 6 — Docs & polish

- `AGENTS.md` — add "Phase 14 — Scheduled Agent Tasks" section (new dirs, API surface table, the headless-mode safety note, the print+json architecture, the per-task tools/skills override, log integration) + Phase Tracker row.
- `PLAN.md` — mark all phases ✅ in the Progress table.
- Update `deploy/install.sh` + `deploy/deploy.sh` only if needed (none expected — scheduler is in-process, no new systemd unit, since runs are children of the web process).
- Manual smoke: create a task with prompt "List the top-level files in this repo" + `read,ls,find` tools + `*/2 * * * *`, enable, watch the Log tab populate and the History row appear.

**When done:** set Phase 6 row to ✅, commit as `docs(agent-tasks): phase 6 — docs + polish`.

---

## Notes for implementing agents

- Follow the repo's test conventions in `AGENTS.md` (bun:test, co-located `*.test.ts(x)`, `makeTestDB()` + `mock.module("@/lib/db", …)` with `?bust=` re-import for DB tests, `@/test-utils/render` for components, `@/test-utils/route-helpers` for routes).
- Keep one writer per cwd. Run `just typecheck` and `just test` before committing each phase.
- After each phase: update the Progress table here (✅), commit on the `feature/scheduled-agent-tasks` branch with the convention above.
- Do not commit `prisma/dev.db`.
- The headless directive must make clear: no user interaction, complete autonomously, do not halt on prompts/permission requests, treat this as a cron job.