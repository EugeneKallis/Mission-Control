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
| `just typecheck`      | Type-check app + scripts + tests               |
| `just test`           | Run unit tests (bun:test)                       |
| `just test-watch`     | Run unit tests in watch mode                    |
| `just test-coverage`  | Run unit tests with coverage report             |
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
cd /opt/mission-control && just install-service
```

This sets up:
- `mission-control.service` — the Next.js app (React frontend + API routes)
- `mission-control-scraper.timer` — runs the scraper task every 30 minutes
- `mission-control-scraper.service` — the scraper task (called by the timer)
- `mission-control-magnet-bridge.service` — long-running Decypharr poller (auto-restart)

### Deploy on push (N8N workflow)

1. N8N detects a push to the repo
2. Runs: `ssh root@server "cd /opt/mission-control && just deploy"`
3. The deploy script: pulls latest → builds → restarts the service

### deploy/ directory

The `deploy/` directory contains the production system:
- `install.sh` — one-time setup: copies service files, enables + starts systemd units
- `deploy.sh` — pull → build → copy to `/opt/mission-control` → restart (called by N8N)
- `mission-control.service` — systemd unit for the Next.js app (frontend + API routes)
- `mission-control-scraper.service` — systemd unit for the scraper task (runs once and exits)
- `mission-control-scraper.timer` — triggers the scraper every 30 minutes
- `mission-control-magnet-bridge.service` — systemd unit for the magnet bridge worker (long-running, `Restart=always`)

## Cron Tasks (External Scheduling)

Tasks live in `src/workers/` and are standalone TypeScript files that **run once and exit**.
They can import from `@/lib/` to share code with the rest of the app.

```bash
just run-worker                          # run scraper task
just run-worker src/workers/other.ts     # run a different task
```

**Production timing is handled externally** — systemd timer, crontab, or similar.
The script just does one job and exits; the scheduler calls it on the desired interval.

## Long-running workers (systemd service, `Restart=always`)

Some workers (e.g. `src/workers/magnet-bridge.ts`, `src/workers/torrent-watch.ts`,
`src/workers/broken-link-checker.ts`) are **always-on pollers**, not cron jobs. For these, ship a persistent
`mission-control-<name>.service` unit alongside the code, install it from
`deploy/install.sh`, and restart it from `deploy/deploy.sh` so it picks up
new code on every push. The `just magnet-bridge`, `just magnet-bridge-logs`,
`just magnet-bridge-restart`, and `just magnet-bridge-stop` recipes are
the per-service management surface. `bl-finder`, `bl-finder-logs`,
`bl-finder-restart`, and `bl-finder-stop` mirror the same pattern. Mirror
this pattern for any new
long-running worker — do **not** schedule it via systemd timer; it would
exit before the next tick and lose its in-memory state.

## Key Conventions

- **API routes** live under `src/app/api/<route>/route.ts`
- **Shared logic** (DB, auth, helpers) goes in `src/lib/`
- **One-off scripts** go in `scripts/` and use the separate `tsconfig.scripts.json`
- **Everything is TypeScript** — strict mode enabled
- **Justfile** is the single source of truth for project commands

## Future Plans

- **pi.dev SDK integration** — SDK will be added to `src/lib/pi/` when available; the project is structured to import it cleanly from there

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
| Phase 7 — Scripts Migration | 18 (One-off scripts → TS) | ✅ Done |
| Phase 8 — ServerTool Migration | 19 (Import from existing ServerTool DB) | ✅ Done |
| Phase 9 — Live history polling | 20 (Incremental output + DB-driven history pages) | ✅ Done |
| Phase 10 — Test coverage gaps | 21 (Component + route + script + worker tests) | ✅ Done |
| Phase 11 — BL Finder | 22 (Broken-link checker: page + worker + API + deploy) | ✅ Done |

**Convention:** After completing a phase, update:
1. This table (set Status to ✅ Done, add next phase as ⏳ In progress)
2. The plan document's completion table at the top of `docs/SERVERTOOL_MIRROR_PLAN.md`

## New directories added in Phase 4

```
src/workers/scrapers/      # One source-specific scraper per file
  141jav.ts                # Big Tits tag listing (3 pages, all magnets)
  projectjav.ts            # big-tits-7 tag (3 pages, first magnet per item)
  pornrips.ts              # 1080p category (1 page, PixHost image enrichment)
  shared.ts                # sanitizeTitle, parseSize, fetchHtml, scrapePixHost
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

## Testing

Unit tests use **bun:test** (built into Bun, no extra install). They
are co-located with source files as `*.test.ts` / `*.test.tsx` and
follow the project's exclusion in `tsconfig.json`; `tsconfig.test.json`
is a dedicated project for type-checking the tests and is what
`just typecheck` runs. **`just test` runs with `--isolate`** so
`mock.module` state and the happy-dom global DOM do not leak between
test files.

### Test infrastructure (`src/test-utils/`)

| File | Purpose |
| ---- | ------- |
| `preload.ts` | bunfig.toml preload: registers jest-dom matchers globally |
| `render.tsx` | `render` / `screen` / `userEvent` re-exports + lazy happy-dom registration (so `.ts` tests keep Bun's native Blob/File) |
| `route-helpers.ts` | `getRequest` / `jsonRequest` / `deleteRequest` / `jsonBody` / `status` for calling Next.js route handlers directly |
| `jest-dom.d.ts` | module augmentation so `.toBeInTheDocument` etc. type-check against bun:test's `Matchers` |

### What is covered

- All pure functions in `src/lib/` (`format`, `cron`, `live-bus`,
  `agents/event-stream`, `agents/registry`, `arr-map`, `config`,
  `migrate`, `runner`, `cron-scheduler`).
- Every HTTP client in `src/lib/clients/` with `fetch` mocked
  (decypharr, real-debrid, arr, plex, trakt, tvmaze).
- All three HTML parsers in `src/workers/scrapers/` plus the shared
  helpers (`sanitizeTitle`, `parseSize`, `scrapePixHost`, `fetchHtml`).
- The scraping status helpers (`withScrapingStatus`,
  `getScrapingStatus`, etc.) with a real in-file Prisma + libsql DB.
- High-value DB query functions in `src/lib/db/queries.ts`
  (idempotent inserts, the auto-Ungrouped group, hide/undo/download
  transitions, `cleanOldScrapeResults` date math,
  `deleteScrapeResultsBySource` filters, file tree + search + cleanup)
  with the same in-file DB.
- The macro runner (`src/lib/runner.ts`) with real `Bun.spawn` for
  local commands and a mock WebSocket on the *real* `agentRegistry`
  singleton for the agent path.
- The cron scheduler lifecycle methods (`init`, `addSchedule`,
  `updateSchedule`, `removeSchedule`, `stopAll`).
- The file scanner's pure helpers (`classifyTarget`, `toPosix`,
  `parentOf`, `emptyToEmpty`, `pMap`, `computeFileCounts`).
- The scraper runner's `parseTargets` argv parser.
- The magnet-bridge worker's pure helpers (`resolvePath`,
  `getDirSize`, `cleanupSmallSymlinks`, `moveToLibrary`).
- **React components** in `src/components/ui/`, `src/components/layout/`,
  `src/components/toast-provider.tsx`, `src/components/agent-modal.tsx`,
  `src/components/macro-log-panel.tsx`, `src/components/browse-scripts.tsx`,
  `src/components/file-tree-viewer.tsx`, `src/components/schedules/*`,
  `src/components/scraper/*`, and `src/components/migrate/migrate-page.tsx`
  (1039 tests total as of Phase 10).
- **Next.js API routes** under `src/app/api/` — every `route.ts` is
  tested by importing the exported `GET`/`POST`/`PUT`/`DELETE` and
  calling them with `NextRequest` from `route-helpers.ts`. DB is
  injected via `makeTestDB()` + `mock.module("@/lib/db", ...)`.
- The `use-live-stream` hook with a stubbed `EventSource`.
- Pure helpers extracted from `scripts/media/*`,
  `scripts/util/command-runner.ts`, and the three worker main loops
  (`agent.ts`, `scraper-worker.ts`, `torrent-watch.ts`).

### What is NOT covered (and why)

- **App Router `page.tsx` files** (`src/app/**/page.tsx`) — most
  are server components that call `db` directly; would need
  Next.js test harness + RSC rendering. The components they render
  *are* covered, so the logic is tested in isolation.
- **Worker main-loop bodies** (`agent.ts`, `scraper-worker.ts`,
  `torrent-watch.ts`, `magnet-bridge.ts` I/O loop) — integration
  scripts that need real HTTP, real symlinks, or a live agent. The
  pure helpers they call are covered; the loop bodies are smoke-tested
  to assert `main()` exists.
- **`scripts/util/icon-gen.ts`** — sharp + image I/O, low value.
- **Scripts that perform live OAuth** (`plex-token-extractor.ts`,
  `trakt-exporter.ts`) — interactive, not unit-testable.

### DB testing infrastructure

DB tests can't talk to the dev SQLite (that would pollute dev data).
`src/lib/db/test-helpers.ts` exports `makeTestDB()` which:

1. Creates a unique temp-file SQLite DB in the OS temp dir.
2. Reads `prisma/migrations/20260621000306_init/migration.sql` and
   applies it to the temp DB.
3. Returns a Prisma client pointed at that DB plus a `cleanup()`
   function to drop the file at the end of the test.

Tests that need the test DB use `mock.module("@/lib/db", ...)` to
inject the test client, then re-import the queries module (often with
a `?bust=<timestamp>` query suffix to dodge the module cache) so the
mocked `@/lib/db` is used.

### Test conventions

- Test files are `*.test.ts` or `*.test.tsx` next to the source they
  cover. The main `tsconfig.json` excludes them; `tsconfig.test.json`
  includes them (and is what `just typecheck` runs).
- Use `describe`/`test`/`expect`/`mock` from `bun:test`.
- `mock.module("@/lib/db", ...)` is process-global; tests that mock
  the same module should be in their own files so the mock doesn't
  leak.
- The `agentRegistry` singleton in `src/lib/agents/registry.ts` is
  always the real one; the test installs a mock WebSocket on it
  rather than replacing the module.
- For `fetch` mocking, save the original `globalThis.fetch` in a
  module-level constant and restore it in `afterEach`.
- For component tests, import `render` / `screen` / `userEvent` from
  `@/test-utils/render` (NOT from `@testing-library/react` directly —
  the helper registers happy-dom lazily).
- For API route tests, import `GET` / `POST` / etc. directly from
  the route file and call them with `NextRequest` from
  `@/test-utils/route-helpers`. Re-import the route module after
  mocking the DB with `import(\`./route.ts?bust=${Date.now()}-${Math.random()}\`)`
  to bypass the module cache.
- For DB tests, use `makeTestDB()` from `@/lib/db/test-helpers` and
  clean up in `afterEach`.

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

### Database on the server (DO NOT commit dev.db)

`prisma/dev.db` is **gitignored** along with its `-wal` / `-journal` /
`-shm` siblings. The schema is created and upgraded on the server by
`prisma migrate deploy`, which both `install.sh` (fresh install) and
`deploy.sh` (every push) run after `bun install`. Do not commit
`prisma/dev.db` — `git pull` would overwrite the live DB while a WAL file
is in use, causing the next write to fail with `SQLITE_READONLY (1032)`
because SQLite refuses to open a DB in read-write mode when its `-wal`
file references pages from a previous version of the main file.

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

## Macro run funneling (home page owns the stream)

The home page (`src/app/page.tsx`) is the only place that owns the SSE
terminal stream (`use-live-stream` connects to `/api/ws` on mount).
Every macro run has to be funneled through it so the user can watch
the output stream live, regardless of where the run was triggered from.

**Mechanism**: home page listens for a `macro:run` window event whose
`detail` is `{ macroId: number, agent?: string }`. Triggers (sidebar,
agent modal, right rail) check the current pathname:

- On `/` → `window.dispatchEvent(new CustomEvent("macro:run", { detail }))`
- On any other page → `router.push("/?run_macro=<id>&agent=<agent>")`. The
  home page's existing deep-link effect reads the query on mount, fires
  the run, and cleans the URL.

The `macro:run-agent` event is the separate "open the agent-picker
modal" signal (handled by `AppShell`). When the user confirms an agent
in the modal, the modal's `onRun` callback also routes through the
same funnel (`handleAgentRun` in `src/components/layout/app-shell.tsx`).

**Why this matters**: if a user clicks a macro from `/admin` or
`/scraper`, we cannot just `fetch("/api/run/...")` and stay on the
page — they would never see the streamed output. Navigation (or an
in-app event when already on home) is required to put the terminal
in front of the user.

## New directories added in Phase 7 (scripts migration)

```
scripts/_lib/                # Shared helpers for one-off scripts
  cli.ts                     # Tiny arg parser (--flag value / --flag=value / short)
  cli.test.ts
  collections.ts             # sortByPriority / chunk / groupBy
  collections.test.ts
  format.ts                  # humanBytes / humanDuration
  format.test.ts
  log.ts                     # info/warn/error/banner/summary with [script] tag
  log.test.ts
scripts/arr/                 # Sonarr/Radarr scripts
  arr-searcher.ts            # Trigger missing-content searches in priority order
  arr-searcher.test.ts
  radarr-sync.ts             # Delete Radarr4K movies not in main Radarr
  radarr-sync.test.ts
  sonarr-sync.ts             # Delete Sonarr4K series not in main Sonarr
  sonarr-season-searcher.ts  # Trigger SeasonSearch for fully-aired empty seasons
  sync-profiles.ts           # Interactive Tag / Quality / Delay profile sync
scripts/media/               # File-system cleanup scripts
  debrid-cleaner.ts          # Remove rclone folders no media symlink references
  special-cleaner.ts         # Remove <75 MB files + empty dirs in media/special
  broken-link-finder.ts      # Find broken symlinks + corrupt media (ffprobe)
scripts/plex/                # Plex.tv / Trakt scripts
  plex-token-extractor.ts    # OAuth PIN flow → print PLEX_TOKEN
  plex-to-arr.ts             # Sync Plex CW + Watchlist → Sonarr/Radarr (anime detection)
  trakt-exporter.ts          # Device-code flow → txt/csv/json export
scripts/torrent/             # Torrent side scripts
scripts/util/                # Utility scripts
  fix-141jav.ts              # One-off DB migration (no-op with current schema)
  icon-gen.ts                # PWA/favicon generator from a source PNG (sharp)
  command-runner.ts          # SSH wrapper with fixed key/host
  github-release.ts          # Poll GitHub for latest releases of tracked repos
src/workers/torrent-watch.ts # Long-running watch dir → Decypharr (NEW worker)
src/workers/magnet-bridge.ts # Long-running Decypharr poller — moves finished `special`
                            # torrents into the media library, cleans small symlinks,
                            # removes the torrent from Decypharr. Pure fs helpers
                            # (resolvePath / getDirSize / cleanupSmallSymlinks /
                            # moveToLibrary) are exported + tested in magnet-bridge.test.ts.
```

### Script conventions

- **Header docstring** with usage, env, examples.
- **CLI:** use `parseArgs()` from `scripts/_lib/cli.ts`. Supports
  `--flag value`, `--flag=value`, short aliases, and kebab→camel
  conversion. Boolean flags default to `false` and can be negated via
  `--no-flag` (handled by string parsing: `--dry-run=false`).
- **Logging:** use `info()` / `warn()` / `error()` / `banner()` /
  `summary()` from `scripts/_lib/log.ts` for consistent `[script]`
  output. Free `console.log` is fine for in-loop traces.
- **Dry-run by default.** Every mutating script accepts a flag
  (typically `--delete`, `--run`, or omitting `--dry-run`) so a fresh
  operator can preview before acting.
- **Module entry-point guard:** scripts guard `main()` with
  `if (import.meta.main) { main().catch(...) }` so they can be
  imported by tests without auto-running.
- **Export `main(argv?: string[])`** so tests can drive the entry
  point without spawning a subprocess.
- **Type-checked** by `just typecheck` (the `tsconfig.scripts.json`
  project); `@/lib/...` paths resolve via the `paths` mapping
  (`baseUrl: "."`, `"@/*": ["./src/*"]`).
- **No `prisma generate` race** — the `postinstall` script in
  `package.json` runs `prisma generate` after every `bun install`, and
  `just setup` explicitly runs `prisma generate` and
  `prisma migrate deploy`.

## New directories added in Phase 8 (ServerTool migration)

```
src/lib/migrate.ts            # Pure migration logic (readSourceSnapshot,
                              # applySnapshot, resolveSourcePath, previewSource,
                              # humanBytes) — unit tested, takes a Prisma client
                              # as a parameter so it works against any DB.
src/lib/migrate.test.ts       # 19 unit tests using makeTestDB() for both the
                              # source (seeded with fakeServerTool data) and
                              # the target. Covers: bad paths, sidecar files,
                              # non-SQLite files, snapshot reads, idempotency,
                              # partial migration, group auto-creation,
                              # uniqueKey dedup, orphan-file handling.
src/app/migrate/page.tsx      # /migrate — not in the sidebar, reached by URL.
src/app/api/migrate/preview/  # POST {dbPath} -> SourceInfo (read-only probe)
src/app/api/migrate/run/      # POST {dbPath, tables} -> MigrationResult
src/components/migrate/
  migrate-page.tsx            # The single client component for /migrate
                              # (path input, debounced auto-preview, table
                              # selector, confirm dialog, result panel).
```

## Phase 8 migrate page UX

- Not in the sidebar — user reaches it by URL (`/migrate`) only.
- Path input auto-previews 600ms after the user stops typing (only if
  the path looks plausible: contains a `/` or ends in `.db`).
- Sidecar files (`.db-shm`, `.db-wal`) are rejected with a clear
  "not a SQLite database file" error — the path validator checks the
  16-byte `SQLite format 3\0` header.
- The preview shows presence + row count for every table the schema
  cares about: `macro_groups`, `macros`, `scrape_results`,
  `scraped_items`, `scraped_item_files`. Missing tables are shown
  disabled in the selector.
- All present tables are auto-checked; user unchecks what they don't
  want. Migration button is disabled until at least one table is
  selected.
- Confirm dialog lists exactly what will be copied (per-table row
  count) before the run.
- Result panel shows per-table `{total, inserted, skipped}`. Skipped
  means "already exists in target" (dedup) or "no parent item found"
  (for `scraped_item_files` whose `scraped_item_id` doesn't exist in
  the source's `scraped_items` table — common in old ServerTool DBs).
- The whole migration is a single Prisma `$transaction`, so a
  mid-run failure rolls everything back.

## Phase 8 migrate page data flow

- Read path: open the user-supplied DB with `@libsql/client`. The
  libsql client does NOT expose a read-only mode at the URL layer
  (its URL query whitelist only knows `tls` and `authToken`), so we
  open the file in normal mode and never issue a write. SQLite's
  locking allows multiple processes to have a DB open concurrently
  as long as only one writes; ServerTool holds the writer lock.
- Write path: a single `db.$transaction(async tx => ...)` block in
  `applySnapshot`. All five tables are handled in dependency order:
  `macro_groups` → `macros` → `scrape_results` → `scraped_items` →
  `scraped_item_files`. The `scraped_item_files` step needs an
  `old-id → new-id` map because each DB autoincrements from 1 and we
  can't preserve the source IDs.
- Idempotency: per-table natural keys.
  - `macro_groups` → skip if a group with the same `name` exists.
  - `macros` → skip if a macro with the same `(name, groupName)` exists.
  - `scrape_results` → skip if a row with the same `uniqueKey` exists.
  - `scraped_items` → skip if a row with the same `magnetLink` exists.
  - `scraped_item_files` → skip if `(scrapedItemId, magnetLink)` exists.
- If `macros` is migrated but `macro_groups` is not, the macro
  handler auto-creates the referenced groups so macros don't end up
  pointing to nonexistent groups.

## Phase 8 API surface

| Method | Path                       | Purpose                                       |
| ------ | -------------------------- | --------------------------------------------- |
| POST   | `/api/migrate/preview`     | Probe source DB, return per-table presence + counts (read-only) |
| POST   | `/api/migrate/run`         | Run the migration; body has `dbPath` + `tables` flags |

## Phase 9 — Live history polling

`runMacro` (in `src/lib/runner.ts`) used to keep the macro's output in an
in-memory `chunks` buffer and only call `updateHistory()` once at the
end. The `/history/[id]` page polled `/api/history/:id` every 5 s, so for
the entire duration of a run the `output` column was empty and the
detail page showed "No output recorded." until the run finalised.

Phase 9 makes the history tab a true database-driven view:

- The runner flushes the `chunks` buffer to `history.output` every **1.5 s**
  while a macro is running. A closure-local `dirty` flag short-circuits
  the interval when nothing has been written since the last flush; a
  failed flush leaves `dirty=true` so the next tick retries.
- The flush interval is cleared in a single `finally` block that wraps
  the whole `runMacro` body, so every exit path (success, agent
  failure, local failure, runner error) stops it before the final
  `updateHistory()` call.
- `flushHistoryOutput(id, output)` in `src/lib/db/queries.ts` is the
  single-row `UPDATE` helper. It only touches the `output` column;
  `status` and `endTime` remain the runner's responsibility at the end.
- `/history` polls `/api/history` every 5 s (skipped while
  `document.hidden`, refreshed on `visibilitychange`).
- `/history/[id]` polls `/api/history/:id` every **2 s** while
  `status === "running"` and drops to 5 s once the row finalises. The
  terminal pane is rendered from `item.output` directly — no SSE.
- The SSE stream at `/api/ws` and `useLiveStream` are still used by the
  home page (`src/app/page.tsx`) and the admin `MacroLogPanel` for
  true real-time output. History pages are deliberately DB-only.
- Manual `Refresh` buttons on both history pages force an immediate
  fetch; the detail page shows a "Last updated: HH:MM:SS" label.

## Phase 11 — BL Finder API surface

| Method | Path | Purpose |
| ------ | ------------------------------------------ | --------------------------------------------- |
| GET | `/api/bl-finder` | List FileCheck rows with filters (status, mediaDir, search, limit, offset) + per-status counts |
| GET | `/api/bl-finder/status` | Worker status (running, lastPassAt, processed/ok/broken counts) |
| GET | `/api/bl-finder/config` | Read checker config |
| PUT | `/api/bl-finder/config` | Update config (batch size, interval, concurrency, timeout, recheck age, discover interval) |
| POST | `/api/bl-finder/recheck` | Mark all (or filtered by mediaDir) rows `pending` for recheck |
| POST | `/api/bl-finder/recheck/[id]` | Recheck one file inline, returns result immediately |
| POST | `/api/bl-finder/delete/[id]` | Delete broken symlink (safety-checked) + remove row |
| POST | `/api/bl-finder/ignore/[id]` | Toggle `isIgnored` on a row |
| POST | `/api/bl-finder/trigger-scan` | Mark all rows pending + clear worker's lastPassAt to trigger immediate discovery |
| POST | `/api/bl-finder/delete-all` | Bulk-delete all non-ignored broken symlinks (optional mediaDir filter, safety-checked) |
| GET | `/api/bl-finder/counts` | Lightweight per-status counts (broken/ok/pending/checking/total) of non-ignored rows; backs the navbar badge |

## New directories added in Phase 11

```
src/components/bl-finder/
  bl-finder-config-bar.tsx  # Editable config bar at the top of the page
  bl-finder-page.tsx        # Main client component
  bl-finder-row.tsx         # Single row in the file list
  bl-finder-types.ts        # Shared TS types
src/lib/broken-link.ts      # Pure helpers + probeFileReadable + discoverFiles + isBrokenSymlink
src/lib/broken-link.test.ts # 15 tests (extOf, isMedia, discoverFiles, isBrokenSymlink, probeFileReadable)
src/lib/p-map.ts            # Shared concurrency-limited parallel map (moved from file-scanner)
src/workers/broken-link-checker.ts       # Long-running poller
src/workers/broken-link-checker.test.ts  # 10 tests (pollOnce with mocked DB + mocked probe)
src/app/database/bl-finder/page.tsx      # Page shell
src/app/api/bl-finder/                   # 10 route files + tests (list, status, config, recheck, delete, delete-all, ignore, trigger-scan, log, counts)
deploy/mission-control-broken-link-checker.service  # systemd unit
```

If the runner process dies mid-run, the `output` column reflects the
last successful flush and the row stays in `status: "running"` until a
manual `updateHistory` (or a future "stale run" cleaner) finalises it.

## Log Viewer alerts (error-count badge + Mark Resolved)

The Log Viewer tab shows a red error-count badge on the sidebar nav item
(matching the BL Finder badge) and highlights error lines in the terminal
panel. A "Mark Resolved" button at the top clears all alerts at once using
a **timestamp watermark** stored in the `settings` table.

### Architecture

- **Watermark model**: A single `Setting` row with key
  `log_alerts:acknowledged_at` stores the epoch-ms timestamp of the last
  "Mark Resolved" action. The error count always reflects lines logged
  **after** this watermark.
- **7-day bound**: Errors older than 7 days are never counted, even if no
  watermark exists yet. Effective `--since` =
  `max(acknowledgedAt, now − 7d)`.
- **Error definition**: The shared regex `ERROR_RE` =
  `\b(error|fatal|panic|crash|exception|failed)\b` (case-insensitive).
  Web request lines (GET / POST / …) are excluded to avoid path-based
  false positives.
- **In-process cache**: `getAllLogAlertCounts()` caches results for 20s
  so overlapping sidebar (60s poll) + logs-page (30s poll) fetches share
  the same journalctl work. The cache is invalidated on acknowledge.

### API surface

| Method | Path | Purpose |
| ------ | ------------------------------------------ | --------------------------------------------- |
| GET | `/api/logs/alerts` | Count errors across all 4 services since watermark/7d. Returns `{ perService, total, acknowledgedAt }` |
| POST | `/api/logs/alerts/acknowledge` | Acknowledge all alerts — sets watermark to now, clears badge until new errors appear |

### Shared module (`src/lib/log-alerts.ts`)

| Export | Purpose |
| ------ | ------- |
| `ERROR_RE` | Case-insensitive error regex for matching log lines |
| `REQUEST_LINE_RE` | Regex to exclude web request noise |
| `SERVICE_MAP` | Maps UI service keys to systemd unit names |
| `isErrorLine(line)` | Pure: true if line is an error and not a request |
| `countErrorsInText(text)` | Pure: count error lines in journal output |
| `getAcknowledgedAt()` | Read watermark from settings table (null = never) |
| `setAcknowledgedAt(ms)` | Write watermark + invalidate cache |
| `runJournalctl(unit, sinceMs)` | Shell out to journalctl, returns text or "" on failure |
| `getAllLogAlertCounts()` | Aggregate error counts across all services (cached 20s) |
| `clearCountsCache()` | Invalidate the in-process cache (for tests) |

### New/modified files

```
src/lib/log-alerts.ts                  # NEW — shared helpers + DB watermarks + journalctl
src/lib/log-alerts.test.ts             # NEW — 17 tests (pure + DB + aggregation)
src/app/api/logs/alerts/route.ts       # NEW — GET /api/logs/alerts
src/app/api/logs/alerts/route.test.ts  # NEW — 5 tests
src/app/api/logs/alerts/acknowledge/route.ts      # NEW — POST /api/logs/alerts/acknowledge
src/app/api/logs/alerts/acknowledge/route.test.ts # NEW — 3 tests
src/components/layout/nav-item.tsx     # MODIFIED — added badgeTitle prop
src/components/layout/sidebar-content.tsx  # MODIFIED — polls /api/logs/alerts for badge
src/app/logs/page.tsx                  # MODIFIED — error highlighting + Mark Resolved
```

