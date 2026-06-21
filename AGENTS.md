# Mission Control — Agent Guide

## Project Overview

A server-hosted service built with Next.js (React frontend + TypeScript API routes backend).  
Supports one-off TypeScript scripts for admin tasks and automation.

## Stack

| Layer        | Technology                                 |
| ------------ | ------------------------------------------ |
| Framework    | Next.js (App Router)                       |
| Frontend     | React                                      |
| Backend      | Next.js API Routes (TypeScript)            |
| Language     | TypeScript (app + scripts)                 |
| Runtime      | **Bun** (runs TS natively, no tsx needed)  |
| Task Runner  | Just (justfile)                            |

## Structure

```
├── src/
│   ├── app/              # Next.js App Router (pages + API routes)
│   │   ├── page.tsx      # Frontend pages
│   │   └── api/          # Backend API routes
│   ├── lib/              # Shared utilities, db clients, config
│   └── workers/          # Long-running background processes
├── scripts/              # One-off TypeScript scripts (run via `just script`)
├── public/               # Static assets
├── justfile              # Project commands
└── AGENTS.md             # ← You are here
```

## Commands

Run via `just <command>`:

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `just setup`   | Install dependencies                     |
| `just init`    | Full setup + typecheck                   |
| `just dev`     | Start Next.js dev server                 |
| `just build`   | Production build                         |
| `just start`   | Start production server                  |
| `just script`  | Run a one-off script                     |
| `just lint`      | Lint code                                |
| `just typecheck`      | Type-check app + scripts                        |
| `just run-worker path` | Run a cron task once (default: scraper)       |
| `just install-service` | One-time: install systemd service on server   |
| `just deploy`          | Full deploy: pull → build → restart (N8N)     |
| `just stop`            | Stop systemd service                           |
| `just restart`         | Restart systemd service                        |
| `just logs`            | Tail service logs                              |

## Deployment

The project runs as a **systemd service** at `/opt/mission-control`.

### Initial install (fresh server)
```bash
# Clone the repo once
git clone <repo-url> /opt/mission-control

# Run the installer
cd /opt/mission-control && sudo just install-service
```

This sets up:
- `mission-control.service` — the Next.js app (React frontend + API routes)
- `mission-control-scraper.timer` — runs the scraper task every 30 minutes
- `mission-control-scraper.service` — the scraper task (called by the timer)

### Deploy on push (N8N workflow)

1. N8N detects a push to the repo
2. Runs: `ssh user@server "cd /opt/mission-control && sudo just deploy"`
3. The deploy script: pulls latest → builds → restarts the service

## Cron Tasks (External Scheduling)

Tasks live in `src/workers/` and are standalone TypeScript files that **run once and exit**.
They can import from `@/lib/` to share code with the rest of the app.

```bash
just run-worker                          # run scraper task
just run-worker src/workers/other.ts     # run a different task
```

**Production timing is handled externally** — systemd timer, crontab, or similar.
The script just does one job and exits; the scheduler calls it on the desired interval.

## Key Conventions

- **API routes** live under `src/app/api/<route>/route.ts`
- **Shared logic** (DB, auth, helpers) goes in `src/lib/`
- **One-off scripts** go in `scripts/` and use the separate `tsconfig.scripts.json`
- **Everything is TypeScript** — strict mode enabled
- **Justfile** is the single source of truth for project commands

## Future Plans

- **pi.dev SDK integration** — SDK will be added to `src/lib/pi/` when available; the project is structured to import it cleanly from there
- **Service deployment** — will run as a systemd service or container; the `just start` / `just stop` / `just restart` targets are stubs for that

## Phase Tracker

When you complete a phase, update this table and mark completed Parts in `docs/SERVERTOOL_MIRROR_PLAN.md`.
This tells the next agent exactly where to pick up.

| Phase | Parts | Status |
|-------|-------|--------|
| Phase 0 — Foundation | 0 (Design system + Prisma + Types + Config), 1 (Layout shell + Components), 2 (Data layer + Lib clients) | ✅ Done |
| Phase 1 — Core CRUD Pages | 4 (Admin), 5 (History), 14 (Database), 15 (Config), 16 (Server Status), 17 (Log Viewer) | ✅ Done |
| Phase 2 — Home + Engines | 3 (Home/Terminal), 9 (Real-time engine), 10 (Cron scheduler) | ✅ Done |
| Phase 3 — Media Viewers | 7 (NZB Viewer), 12 (File scanner worker) | ✅ Done |
| Phase 4 — Scraper | 8 (Scraper page), 13 (Scraper workers) | ✅ Done |
| Phase 5 — Scheduling | 6 (Schedules page) | ✅ Done |
| Phase 6 — Agent System | 11 (Agent remote-exec) | ✅ Done |
| Phase 7 — Scripts Migration | 18 (One-off scripts → TS) | ❌ Not started |

**Convention:** After completing a phase, update:
1. This table (set Status to ✅ Done, add next phase as ⏳ In progress)
2. The plan document's completion table at the top of `docs/SERVERTOOL_MIRROR_PLAN.md`

## New directories added in Phase 4

```
src/workers/scrapers/      # One source-specific scraper per file
  141jav.ts                # Big Tits tag listing (3 pages, all magnets)
  projectjav.ts            # big-tits-7 tag (3 pages, Torbox cache filter)
  pornrips.ts              # 1080p category (1 page, PixHost image enrichment)
  shared.ts                # sanitizeTitle, parseSize, fetchHtml, scrapePixHost, Torbox helper
  status.ts                # DB-backed is_scraping flag (so web and worker share state)
src/components/scraper/    # UI for /scraper
  access-gate.tsx          # "Authorized Personnel Only" modal + inactivity lock
  scraper-page.tsx         # Main client component (toolbar / tabs / cards / keyboard nav)
  scraper-card.tsx         # Single scrape result card
  scraper-types.ts         # Shared TS types for the scraper
```

## New directories added in Phase 5

```
src/components/schedules/
  schedules-list.tsx       # List page client component (rows + toggle + delete)
  new-schedule-form.tsx    # Form for the "New Schedule" card on the list page
  edit-schedule-form.tsx   # Edit form (re-uses the same shape as new-schedule-form)
src/lib/cron.ts            # Cron expression builder + parser + validator
                           # Mirrors the Go generateCronExpression / parseCronToForm
```

## Phase 5 schedule form pattern

The schedules form has three shapes (interval / daily / weekly) with
conditional fields. The client builds the cron expression via
`buildCronExpression(values)` from `src/lib/cron.ts` and sends it to
`POST /api/schedules` — the server stores it verbatim. The edit form
calls `parseCronToForm(cronExpression)` to pre-fill the form from the
stored expression.

The Go original only supports three shapes. We follow that: no
arbitrary cron strings, no advanced recurrence. The `validateCronExpression`
helper is only used to reject obvious garbage in the unlikely event a
caller bypasses `buildCronExpression`.

## Phase 5 — Schedules page

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/api/schedules`                  | List all schedules (with macro name)   |
| POST   | `/api/schedules`                  | Create schedule (body: `{macroId, cronExpression}`) |
| GET    | `/api/schedules/[id]`             | Get single schedule                    |
| PUT    | `/api/schedules/[id]`             | Update schedule (preserves enabled state) |
| DELETE | `/api/schedules/[id]`             | Delete + unregister                    |
| POST   | `/api/schedules/[id]/toggle`      | Toggle enabled + add/remove from scheduler |

## Phase 4 worker pattern

`src/workers/scraper-runner.ts` is the orchestrator. It is invoked in two ways:

| Caller                      | Command                                                                  | Effect                             |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `mission-control-scraper.timer` (systemd) | `bun run src/workers/scraper-worker.ts` → `runAllSources()` | All three sources, sequentially    |
| `POST /api/scraper/trigger` (web)         | `triggerSourceInBackground(src)`                            | One source, background             |
| `POST /api/scraper/trigger-all`           | `triggerAllSourcesInBackground()`                           | All three sources, background      |
| Manual (one source)         | `just run-worker src/workers/scraper-runner.ts -- <source>`               | One source, foreground (logs visible) |

Scraping status (`is_scraping` per source) is stored in the `settings` table
under the key `scraper_status:<source>` so the web process and worker process
can share it. The web page polls `/api/scraper/status?source=` every 2s.

## Phase 4 API surface

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/api/scraper/results?source=`    | List visible results for a source      |
| GET    | `/api/scraper/status?source=`     | Is a source currently scraping?        |
| GET    | `/api/scraper/status-all`         | Is any source currently scraping?      |
| POST   | `/api/scraper/trigger`            | Trigger one source                     |
| POST   | `/api/scraper/trigger-all`        | Trigger all three sources              |
| POST   | `/api/scraper/hide`               | Hide one result (id)                   |
| POST   | `/api/scraper/undo`               | Un-hide (source = last hidden, or id)  |
| POST   | `/api/scraper/download`           | Submit to Decypharr, mark downloaded   |
| POST   | `/api/scraper/hide-all`           | Hide all (or all for a source)         |
| POST   | `/api/scraper/refresh`            | Clear + rescrape (source, or all)      |

## Phase 4 — Prisma 7 driver-adapter note

Prisma 7 removed the no-arg `new PrismaClient()` constructor. The DB client
in `src/lib/db/index.ts` now uses `@prisma/adapter-libsql` (libsql fork of
SQLite that runs in both **Node** and **Bun**). This is the one adapter
that works in both runtimes — `better-sqlite3` does not run in Bun, which
would break the scraper/file-scanner workers. Migrations are owned by
`prisma.config.ts` (Prisma 7 moved datasource config there).

## New directories added in Phase 6

```
src/lib/agents/
  registry.ts        # In-memory agent connection map (hostname → client)
  event-stream.ts    # Per-hostname SSE bus for server→agent command push
src/workers/agent.ts # Bun-native agent binary that runs on remote hosts
```

## Phase 6 agent system architecture

The agent is a Bun process that runs on each remote host. Communication
with the web server is split into two channels to avoid WebSocket
(Next.js App Router doesn't natively support upgrades):

- **Server → Agent (SSE):** the agent opens a long-lived `GET
  /api/agent/events?hostname=X` connection. The server pushes commands
  as JSON-encoded `data:` events. If the SSE stream drops, the agent
  reconnects after 5s.
- **Agent → Server (HTTP POST):** the agent POSTs `/api/agent/heartbeat`
  every 5s with system stats (CPU, memory, IP, version), and POSTs
  `/api/agent/result` for individual output chunks / exit codes so the
  runner can stream output to the terminal in real time.

This means the runner's `agentRegistry.dispatch()` blocks until the agent
posts back an `exit` result, with an optional `onChunk` callback for
streaming. Each command has a 5-minute timeout, matching the Go runner.

The agent binary is in `src/workers/agent.ts` — Bun-native, no Go build
step required. The install script (`/api/agent/install`) detects arch,
pulls the source via `/api/agent/source`, and runs it under bun via a
systemd unit. For users who ship a prebuilt Go binary, the
`/api/agent/download?arch=amd64|arm64|arm` endpoint serves files from
`bin/agent-linux-<arch>` if present.

## Phase 6 agent API surface

| Method | Path                                       | Purpose                                |
| ------ | ------------------------------------------ | -------------------------------------- |
| GET    | `/api/agent/events?hostname=`              | SSE — server pushes commands           |
| POST   | `/api/agent/heartbeat`                     | Agent reports status + result delivery |
| POST   | `/api/agent/result`                        | Agent streams output/exit              |
| GET    | `/api/agent/install`                       | Install shell script (curl pipe)       |
| GET    | `/api/agent/download?arch=ts\|amd64\|arm64\|arm` | Agent binary (TS wrapper or prebuilt) |
| GET    | `/api/agent/source`                        | Bundled agent source (Bun-native)      |
| GET    | `/api/agents`                              | List registered agents                 |
| GET    | `/api/agents/options`                      | List hostnames for the agent modal     |
| POST   | `/api/agent/request-update/[id]`           | Mark agent for update on next heartbeat |
| POST   | `/api/agent/request-update-all`            | Mark every agent for update            |
| POST   | `/api/agent/request-restart/[id]`          | Mark agent for restart on next heartbeat |

## Important!

This file is the living scope and convention document.  
**When you add a new capability, update this file** — new directories, new commands, new patterns, new scripts.  
Keeping AGENTS.md current ensures agents and collaborators stay aligned with the project shape.
