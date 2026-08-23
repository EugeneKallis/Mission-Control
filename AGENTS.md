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
| `just energy-prices` | Run the energy-price scraper once (foreground) |
| `just energy-prices-logs` | Tail energy-price scraper logs |
| `just energy-prices-restart` | Restart the energy-price scraper service |
| `just energy-prices-stop` | Stop the energy-price scraper service |
| `just run-worker path` | Run a worker task once (default: scraper)     |
| `just remove-legacy-agents` | Drop residual legacy `server_agents` DB table (dry-run default) |
| `just install-service` | One-time: install systemd service on server   |
| `just deploy`          | Full deploy: pull → build → restart (N8N)     |
| `just cleanup`         | Remove old systemd services (dry run)         |
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
- `mission-control-magnet-bridge.service` — long-running Decypharr poller (auto-restart)
- `mission-control-broken-link-checker.service` — long-running broken link checker (auto-restart)
- `mission-control-scraper.service` — one-off scraper task (manual runs only)
- `mission-control-energy-price-scraper.service` — one-off energy price scraper (manual runs only)

**Note:** The scraper and energy price scraper are now scheduled via the in-process
Worker Timer scheduler (configured in the web UI at `/timers`). The systemd `.service`
units are kept for manual one-off runs but the `.timer` units are no longer installed.

### Deploy on push (N8N workflow)

1. N8N detects a push to the repo
2. Runs: `ssh root@server "cd /opt/mission-control && just deploy"`
3. The deploy script: pulls latest → builds → restarts the service

### deploy/ directory

The `deploy/` directory contains the production system:
- `install.sh` — one-time setup: copies service files, enables + starts systemd units
- `deploy.sh` — pull → build → copy to `/opt/mission-control` → restart (called by N8N)
- `cleanup.sh` — remove old systemd services replaced by in-process worker timer scheduler
- `mission-control.service` — systemd unit for the Next.js app (frontend + API routes)
- `mission-control-scraper.service` — systemd unit for the scraper task (runs once and exits)
- `mission-control-magnet-bridge.service` — systemd unit for the magnet bridge worker (long-running, `Restart=always`)
- `mission-control-broken-link-checker.service` — systemd unit for the broken link checker (long-running, `Restart=always`)
- `mission-control-energy-price-scraper.service` — systemd unit for the EnergizeCT rate scraper (runs once and exits)

## Cron Tasks (Worker Timer Scheduler)

Tasks live in `src/workers/` and are standalone TypeScript files that **run once and exit**.
They can import from `@/lib/` to share code with the rest of the app.

**Scheduling is now handled in-process** via the Worker Timer scheduler at `/timers`.
Each timer stores a cron expression and worker path in the database, and the scheduler
runs them automatically. No external systemd timers are needed.

```bash
just run-worker                          # run scraper task (one-off)
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

## Arr Instance Configuration

The project manages ten built-in Radarr/Sonarr instance URLs and API keys through
a canonical configuration module at `src/lib/arr-config.ts`.

### Canonical definitions

`ARR_INSTANCE_DEFINITIONS` is the single source of truth — it defines names, slugs,
types, and default URLs for all ten instances (Radarr, Radarr4K, RadarrKids,
RadarrAnime, RadarrLocal, Sonarr, Sonarr4K, SonarrKids, SonarrAnime, SonarrLocal).
Every runtime consumer and UI component derives from this list rather than
maintaining its own copy.

### Precedence

For both URL and API key, effective values follow:

```text
environment variable > Config page (website DB) > built-in default
```

- **Environment variables:** `ARR__<NAME>__URL` and `ARR__<NAME>__API_KEY` (e.g.
  `ARR__RADARR__URL=http://192.168.1.111:7878`). These always win if set.
- **Config page:** Values stored via `/admin/config` in the `configs` DB table under
  keys like `arr_radarr_url`, `arr_radarr_api_key`, etc. Used at runtime when no
  env override exists.
- **Built-in defaults:** Hardcoded in `ARR_INSTANCE_DEFINITIONS` for URLs; API keys
  default to empty.

### Import format

The Config page includes a bulk-import textarea that accepts records in a
three-line format (name / URL / API key), with optional blank-line separators.

```text
radarr
http://192.168.1.111:7878
replace-with-radarr-api-key

radarr4k
http://192.168.1.111:7879
replace-with-radarr4k-api-key
```

Only the ten built-in instance names are accepted. Unknown names, invalid URLs,
incomplete records, and duplicates produce visible issues without exposing API
key values. See `parseArrImport()` in `src/lib/arr-config.ts`.

### DB storage keys

Each instance gets two flat DB config keys generated from the canonical definitions:
`arr_<slug>_url` and `arr_<slug>_api_key`. See `arrConfigDbKey()` in
`src/lib/arr-config.ts`. The full set is exported as `ARR_CONFIG_DB_KEYS`.

### Runtime consumers

The following consumers use `resolveConfig()` from `@/lib/config` which applies
env > DB > default precedence:

| Consumer | Resolution |
| -------- | ---------- |
| `scripts/arr/arr-searcher.ts` | `resolveConfig()` via `@/lib/config` |
| `scripts/arr/radarr-sync.ts` | `resolveConfig()` via `@/lib/config` |
| `scripts/arr/sonarr-sync.ts` | `resolveConfig()` via `@/lib/config` |
| `scripts/arr/sonarr-season-searcher.ts` | `resolveConfig()` via `@/lib/config` |
| `scripts/arr/sync-profiles.ts` | `resolveConfig()` via `@/lib/config` |
| `scripts/plex/plex-to-arr.ts` | `resolveConfig()` via `@/lib/config` |
| `src/app/api/arr/instance-map/route.ts` | `await resolveConfig()` (async) |

Consumers that only need media paths (e.g. `src/workers/file-scanner.ts`) use
env-only `getConfig()` and are unaffected.

### Config API (`/api/config`)

- `GET /api/config` — Returns all stored config values (including Arr keys).
  Response has `Cache-Control: no-store`.
- `PUT /api/config` — Accepts any of the Arr DB keys plus `real_debrid_api_key`,
  `plex_token`, `plex_url`. Arr URL values are validated to start with `http://`
  or `https://`; empty strings clear the stored override. Unknown keys are
  silently ignored. API key values never appear in validation error details.

## Key Conventions

- **API routes** live under `src/app/api/<route>/route.ts`
- **Shared logic** (DB, auth, helpers) goes in `src/lib/`
- **One-off scripts** go in `scripts/` and use the separate `tsconfig.scripts.json`
- **Everything is TypeScript** — strict mode enabled
- **Justfile** is the single source of truth for project commands

## Runtime Theme System

Mission Control has a persisted runtime theme system with eight dark themes.
Themes are applied via the `data-theme` attribute on `<html>` and persisted
in localStorage (versioned key `mission-control:theme:v1`). A synchronous head
bootstrap applies the stored palette before first paint; React keeps the server
and first client render on the same default snapshot, then synchronizes its
context after hydration.

### Theme registry (`src/lib/theme.ts`)

Pure data module — safe to import from server components. Defines:

| Export | Purpose |
|--------|---------|
| `ThemeId` | `"midnight-cyan" | "graphite-violet" | "deep-ocean" | "ember-copper" | "forest-emerald" | "rose-noir" | "crimson-night" | "solar-gold"` |
| `THEMES` | Array of `ThemeEntry` with label, description, swatches, themeColor |
| `DEFAULT_THEME` | `"midnight-cyan"` |
| `STORAGE_KEY` | `"mission-control:theme:v1"` (versioned) |
| `isValidThemeId(id)` | Type guard / allowlist |
| `getTheme(id)` | Lookup entry by id |
| `getThemeColor(id)` | Get browser theme-color |
| `BOOTSTRAP_SCRIPT` | Synchronous FOUC prevention script for `<head>` |

### Provider & Hook (`src/components/theme/theme-provider.tsx`)

- `ThemeProvider` — client context provider placed in the root layout
- `useTheme()` — returns `{ themeId, setThemeId, themes }`
- First client render matches the server default to avoid hydration mismatch
- After hydration: adopts the already-bootstrapped `<html data-theme>` value
- `setThemeId`: applies DOM + `theme-color` immediately, then persists best-effort
- Listens for `storage` events and applies cross-tab changes immediately
- Tolerates missing or blocked localStorage without preventing visual changes

### ThemeSwitcher (`src/components/theme/theme-switcher.tsx`)

- Two variants: `"default"` (sidebar, full-width with swatches) and `"compact"` (44×44 icon button for mobile header)
- Opens a viewport-safe 228px two-column panel (max-height bounded, internally scrollable on short viewports) with palette swatches, labels, descriptions, and a checkmark for the selected theme
- Accessible: `aria-expanded`/`aria-controls`, labelled `radiogroup`, roving `role="radio"` options, Arrow/Home/End navigation, selected-state announcement, `Escape`, outside-click, and focus restoration

### CSS Architecture

Each theme is defined in `src/app/globals.css` as an `html[data-theme="..."]` block
that overrides all Tailwind `--color-*` variables plus derived tokens:

| Token | Purpose |
|-------|---------|
| `--color-border` | Replaces `rgba(71, 85, 105, 0.3)` everywhere |
| `--terminal-bg` / `--terminal-fg` / `--terminal-fg-alt` | Terminal backgrounds and text |
| `--glass-bg` / `--glass-border` | Glassmorphism modal appearance |
| `--status-*-bg` / `--status-*-fg` / `--status-*-border` | Status pill colors (running/success/failed) |
| `--color-badge-error-*` | Error-count badge on NavItem |
| `--toggle-enabled-bg` / `--toggle-disabled-bg` | ToggleSwitch background |

### Adding a new theme

1. Add the id to the `ThemeId` union in `src/lib/theme.ts`
2. Add a `ThemeEntry` to the `THEMES` array (the bootstrap allowlist and browser color map are generated from this registry)
3. Add an `html[data-theme="..."]` block in `globals.css` with all semantic and derived variables

## Future Plans

- **pi.dev SDK integration** — SDK will be added to `src/lib/pi/` when available; the project is structured to import it cleanly from there

## Operations dashboard (`/operations`)

For backup storage and verification, deploy records, release polling, AdGuard/TLS checks,
maintenance suppression, API actions, and the CLI-only restore procedure, read
`docs/OPERATIONS.md` before changing the operations subsystem.

## Phase Tracker

When you complete a phase, update this table and mark completed Parts in `docs/SERVERTOOL_MIRROR_PLAN.md`.
This tells the next agent exactly where to pick up.

| Phase | Parts | Status |
|-------|-------|--------|
| Phase 0 — Foundation | 0 (Design system + Prisma + Types + Config), 1 (Layout shell + Components), 2 (Data layer + Lib clients) | ✅ Done |
| Phase 1 — Core CRUD Pages | 4 (Admin), 5 (History), 14 (Database), 15 (Config), 17 (Log Viewer) | ✅ Done |
| Phase 2 — Home + Engines | 3 (Home/Terminal), 9 (Real-time engine), 10 (Cron scheduler) | ✅ Done |
| Phase 3 — Media Viewers | 7 (NZB Viewer), 12 (File scanner worker) | ✅ Done |
| Phase 4 — Scraper | 8 (Scraper page), 13 (Scraper workers) | ✅ Done |
| Phase 5 — Scheduling | 6 (Schedules page) | ✅ Done |
| Phase 6 — Agent System | 11 (Agent remote-exec) | 🗑️ Retired — replaced by Pi agent chat/tasks + Proxmox |
| Phase 7 — Scripts Migration | 18 (One-off scripts → TS) | ✅ Done |
| Phase 8 — ServerTool Migration | 19 (Import from existing ServerTool DB) | ✅ Done |
| Phase 9 — Live history polling | 20 (Incremental output + DB-driven history pages) | ✅ Done |
| Phase 10 — Test coverage gaps | 21 (Component + route + script + worker tests) | ✅ Done |
| Phase 11 — BL Finder | 22 (Broken-link checker: page + worker + API + deploy) | ✅ Done |
| Phase 12 — Chat | 23 (Chat: provider catalog + model selector + attachments + media warnings) | ✅ Done |
| Phase 13 — Pi Agent Integration | Pi-powered chat (Phases 1–9): process manager, SSE/command endpoints, skills/tools settings, streaming UI, tool call rendering, model controls, session persistence, legacy cleanup | ✅ Done |
| Phase 14 — Scheduled Agent Tasks | Cron-scheduled Pi agent tasks: headless print+JSON mode, per-task tools/skills, scheduler, API, UI, Log tab integration | ✅ Done |
| Phase 15 — Proxmox VE Monitoring | Proxmox cluster dashboard: multi-endpoint config, live CPU/RAM/disk/guest snapshot, expandable node→VM/LXC/Storage drill-down | ✅ Done |
| Phase 16 — Docker Logs | Configurable multi-Dozzle container/log viewer with client-side instance grouping and MC SSE/JSONL pass-through routes | ✅ Done |
| Phase 17 — Energy-price history graph | 24 (time-series chart of supplier rates at bottom of `/energy-prices` with 7/30/60/120/365-day toggle and target-rate reference line; reuses the existing `energy_prices` rows instead of a parallel table) | ✅ Done |
| Phase 18 — Operations | 25 (verified MC backups, deploy ledger, release radar, AdGuard health, TLS expiry, maintenance windows) | ✅ Done |
| Phase 19 — Integration Health | 26 (concurrent health matrix for configured external integrations) | ✅ Done |
| Phase 20 — Action Audit Trail | 27 (sanitized records for destructive and configuration actions) | ⏳ In progress |

Expansion phases 19–33 are specified in `docs/EXPANSION_PLAN.md`.

**Convention:** After completing a phase, update:
1. This table (set Status to ✅ Done, add next phase as ⏳ In progress)
2. The plan document's completion table at the top of `docs/SERVERTOOL_MIRROR_PLAN.md`

## New directories added in Phase 4

```
src/workers/scrapers/      # One source-specific scraper per file
  141jav.ts                # Big Tits tag listing (3 pages, all magnets)
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

## New directories added for Worker Timers

```
src/components/timers/
  timers-list.tsx          # List page client component (rows + toggle + delete + create form)
src/lib/worker-timer-scheduler.ts  # In-process cron scheduler for worker timers
src/app/timers/
  page.tsx                 # /timers page shell
src/app/api/timers/
  route.ts                 # GET list + POST create
  [id]/route.ts            # GET show + PUT update + DELETE
  [id]/toggle/route.ts     # POST toggle enabled/disabled
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
- Both HTML parsers in `src/workers/scrapers/` plus the shared
  helpers (`sanitizeTitle`, `parseSize`, `scrapePixHost`, `fetchHtml`).
- The scraping status helpers (`withScrapingStatus`,
  `getScrapingStatus`, etc.) with a real in-file Prisma + libsql DB.
- High-value DB query functions in `src/lib/db/queries.ts`
  (idempotent inserts, the auto-Ungrouped group, hide/undo/download
  transitions, `cleanOldScrapeResults` date math,
  `deleteScrapeResultsBySource` filters, file tree + search + cleanup)
  with the same in-file DB.
- The macro runner (`src/lib/runner.ts`) with real `child_process.spawn` for
  local commands.
- The cron scheduler lifecycle methods (`init`, `addSchedule`,
  `updateSchedule`, `removeSchedule`, `stopAll`).
- The file scanner's pure helpers (`classifyTarget`, `toPosix`,
  `parentOf`, `emptyToEmpty`, `pMap`, `computeFileCounts`).
- The scraper runner's `parseTargets` argv parser.
- The magnet-bridge worker's pure helpers (`resolvePath`,
  `getDirSize`, `cleanupSmallSymlinks`, `moveToLibrary`).
- **React components** in `src/components/ui/`, `src/components/layout/`,
  `src/components/toast-provider.tsx`,
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

## Energy Prices page (`/energy-prices`)

| Method | Path | Purpose |
| ------ | ------------------------------------------ | --------------------------------------------- |
| GET | `/api/energy-prices` | Latest offers + target rate + `hasBetter` flag |
| PUT | `/api/energy-prices/target` | Set user's target rate (body: `{ rate: number }`) |
| POST | `/api/energy-prices/refresh` | Trigger immediate scrape (synchronous, ~20-40s) |

### DB model

`EnergyPrice` table stores one row per offer per scrape. Old rows are
marked `isActive=false` on each new scrape. The API always returns active
rows sorted by rate (cheapest first).

### Target rate + badge

The sidebar polls `/api/energy-prices` every 60s. If the user has set a
target rate and any offer beats it, a badge appears on the "Energy Prices"
nav link showing the count of better offers.

The target rate is stored in the `settings` table under
`energy_price:target_rate` (¢/kWh). Set/reset from the page's top card.

### Data source

Scraped from [EnergizeCT.com](https://www.energizect.com/rate-board/compare-energy-supplier-rates)
using Playwright headless Chromium. The site uses Cloudflare Turnstile, so
stealth techniques are needed:
- Realistic Chrome UA + viewport
- `navigator.webdriver` override
- `navigator.plugins` + `navigator.languages` + `chrome.runtime` polyfill

## Phase 5 — Schedules page

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/api/schedules`                  | List all schedules (with macro name)   |
| POST   | `/api/schedules`                  | Create schedule (body: `{macroId, cronExpression}`) |
| GET    | `/api/schedules/[id]`             | Get single schedule                    |
| PUT    | `/api/schedules/[id]`             | Update schedule (preserves enabled state) |
| DELETE | `/api/schedules/[id]`             | Delete + unregister                    |
| POST   | `/api/schedules/[id]/toggle`      | Toggle enabled + add/remove from scheduler |

## Worker Timers — In-process scheduling for background workers

Worker Timers replace the external systemd timer units (`mission-control-scraper.timer`
and `mission-control-energy-price-scraper.timer`). They store cron expressions in the
`worker_timers` DB table and run workers in-process via the `cron` npm package.

### API surface

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/api/timers`                     | List all worker timers + preset registry |
| POST   | `/api/timers`                     | Create timer (body: `{name, workerPath, cronExpression}`) |
| GET    | `/api/timers/[id]`                | Get single timer                       |
| PUT    | `/api/timers/[id]`                | Update timer                           |
| DELETE | `/api/timers/[id]`                | Delete timer + unregister              |
| POST   | `/api/timers/[id]/toggle`         | Toggle enabled + add/remove from scheduler |

### DB model

`WorkerTimer` table stores one row per configured timer:
- `name` — human-readable label (e.g. "Scraper", "Energy Price Scraper")
- `workerPath` — relative path to the worker script (e.g. `src/workers/scraper-worker.ts`)
- `cronExpression` — 5-field cron expression (e.g. `*/30 * * * *`)
- `enabled` — whether the timer is active
- `lastRunAt` — timestamp of last execution
- `lastStatus` — `"success"` or `"error"` from last run

### Scheduler

`src/lib/worker-timer-scheduler.ts` initializes on server boot (via `instrumentation.ts`)
and loads all enabled timers from the DB. Each timer gets a `CronJob` instance that
imports and runs the worker's `main()` function on the configured schedule.

### Preset workers

| Name | Worker Path | Default Schedule | Description |
| ---- | ----------- | ---------------- | ----------- |
| Scraper | `src/workers/scraper-worker.ts` | `*/30 * * * *` (every 30 min) | Runs all scrape sources |
| Energy Price Scraper | `src/workers/energy-price-scraper.ts` | `0 8 * * *` (daily at 8 AM) | Scrapes EnergizeCT.com rates |

Custom workers can also be added by specifying a worker script path directly.

## Phase 4 worker pattern

`src/workers/scraper-runner.ts` is the orchestrator. It is invoked in two ways:

| Caller                      | Command                                                                  | Effect                             |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| Worker Timer scheduler (in-process) | `worker-timer-scheduler.ts` → `main()` | All scrape sources, sequentially    |
| `POST /api/scraper/trigger` (web)         | `triggerSourceInBackground(src)`                            | One source, background             |
| `POST /api/scraper/trigger-all`           | `triggerAllSourcesInBackground()`                           | All scrape sources, background      |
| Manual (one source)         | `just run-worker src/workers/scraper-runner.ts -- <source>`               | One source, foreground (logs visible) |

The Worker Timer scheduler (`/timers` page) stores cron expressions in the `worker_timers`
DB table and runs workers in-process. No external systemd timers are needed for scheduling.
The systemd `.service` units are kept only for manual one-off runs.

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
| POST   | `/api/scraper/trigger-all`        | Trigger all scrape sources              |
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

## Retired: Phase 6 remote agent system (ServerAgent / Server Status)

The legacy remote-agent system (a Bun agent binary on remote hosts, the
`server_agents` table, `/status` Server Status page, `/api/agent/*` and
`/api/agents/*` routes, `src/lib/agents/` registry, and the `runOnAgent` /
`agentHostname` macro fields) has been **removed**. Server monitoring is
now covered by the Proxmox dashboard (`/pve`), and remote execution is
covered by the Pi agent system (chat + scheduled tasks).

All associated code, the Prisma model, and the `server_agents` table have
been deleted. The migration `20260731120000_remove_server_agents` drops
the table and the two Macro columns. Macros always run locally now; the
runner no longer has a remote-execution path.

For operators: if any remote `mission-control-agent` systemd units were
installed on external hosts before the removal, stop and uninstall them
manually on those hosts — nothing in this repo manages them anymore. A
`just remove-legacy-agents` command is available to clear any residual
`server_agents` rows from an un-migrated database (dry-run by default;
`just remove-legacy-agents -- --run` drops the table).

## Macro run funneling (home page owns the stream)

The home page (`src/app/page.tsx`) is the only place that owns the SSE
terminal stream (`use-live-stream` connects to `/api/ws` on mount).
Every macro run has to be funneled through it so the user can watch
the output stream live, regardless of where the run was triggered from.

**Mechanism**: home page listens for a `macro:run` window event whose
`detail` is `{ macroId: number }`. Triggers (sidebar, right rail) check
the current pathname:

- On `/` → `window.dispatchEvent(new CustomEvent("macro:run", { detail }))`
- On any other page → `router.push("/?run_macro=<id>")`. The
  home page's existing deep-link effect reads the query on mount, fires
  the run, and cleans the URL.

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
  remove-legacy-agents.ts    # Drop residual legacy server_agents table (dry-run default)
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
  `--no-flag` (handled by string parsing: `--run=false`).
- **Logging:** use `info()` / `warn()` / `error()` / `banner()` /
  `summary()` from `scripts/_lib/log.ts` for consistent `[script]`
  output. Free `console.log` is fine for in-loop traces.
- **Dry-run by default.** Every mutating script defaults to dry-run mode.
  Pass `--run` to actually perform mutations. The only exception is
  `command-runner.ts`, which is intentionally always-live (it is a
  passthrough SSH executor).
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
  `document.hidden`, refreshed on `visibilitychange`). The list also derives
  checkbox filters from the displayed history titles, with per-title counts and
  a Clear all filters control; filtering is client-side.
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
| POST | `/api/bl-finder/recheck` | Mark all (or rows filtered by status, mediaDir, and search) `pending` for recheck |
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

The Log Viewer shows per-service error-count badges on its service tabs, a
total badge on the sidebar nav item (matching the BL Finder badge), and
highlights error lines in the terminal panel. The **tab badges** count errors
in the currently displayed log content for each service (since the service
started for systemd units, or the latest 50 Agent Task runs). The **header and
sidebar badges** are alert aggregates: they count errors since the last
"Mark Resolved" watermark (or 7 days, whichever is tighter). A "Mark Resolved"
button clears only the aggregate header and sidebar badges; the tab badges
stay because they reflect the visible logs, not the alert window.

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
| GET | `/api/logs/alerts` | Count errors across all services since watermark/7d. Returns `{ perService, total, acknowledgedAt }` |
| GET | `/api/logs/alerts?window=visible` | Count errors in the visible log window for each service (same content as `/api/logs?service=<key>&lines=all`). Returns `{ perService, total, acknowledgedAt }` |
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
| `getAllLogAlertCounts()` | Aggregate error counts across all services since watermark/7d (cached 20s) |
| `getVisibleLogAlertCounts()` | Count errors in the visible log window for each service (cached 20s) |
| `clearCountsCache()` | Invalidate both in-process caches (for tests) |
| `fetchLogText(service, lines, taskId?)` | Shared server-only helper: returns the same log text `/api/logs` renders |

### New/modified files

```
src/lib/log-alerts.ts                  # NEW — shared helpers + DB watermarks + journalctl
src/lib/log-alerts.test.ts             # NEW — 17 tests (pure + DB + aggregation)
src/lib/log-fetcher.ts                 # NEW — shared server-only log text retrieval (route + visible counts)
src/lib/log-fetcher.test.ts            # NEW — 10 tests (journalctl + agent tasks + routing)
src/app/api/logs/alerts/route.ts       # NEW — GET /api/logs/alerts (+ ?window=visible)
src/app/api/logs/alerts/route.test.ts  # NEW — 7 tests (default + visible window)
src/app/api/logs/alerts/acknowledge/route.ts      # NEW — POST /api/logs/alerts/acknowledge
src/app/api/logs/alerts/acknowledge/route.test.ts # NEW — 3 tests
src/app/api/logs/route.ts              # MODIFIED — uses shared log-fetcher helper
src/app/api/logs/route.test.ts         # NEW — 13 tests
src/app/logs/page.tsx                  # MODIFIED — per-tab visible counts + Mark Resolved
src/app/logs/page.test.tsx             # NEW — 6 tests (tab badges + visible counts)
src/components/layout/nav-item.tsx     # MODIFIED — added badgeTitle prop
src/components/layout/sidebar-content.tsx  # MODIFIED — polls /api/logs/alerts for badge
src/components/layout/sidebar-content.test.tsx # NEW — 17 tests (incl. Log Viewer badge)
```

## Phase 12 — Chat (legacy, replaced by Pi Agent)

> **This phase has been superseded.** The old static ChatPage (provider catalog,
> model selector, attachments, media warnings) has been fully replaced by a
> full Pi-powered chat at `/chat`. See **Pi Agent Integration** below for
> the current architecture.
>
> All old chat files have been deleted in Phase 9 of Pi Agent Integration:
> - `src/lib/chat/` — models, provider, keys
> - `src/app/api/chat/` — sessions, models, messages routes
> - `src/components/chat/` — chat-page, chat-types
> - Prisma models `ChatSession`/`ChatMessage` removed
> - Migration `20260714000000_drop_chat_tables` drops the tables

## Pi Agent Integration (Phases 1-9)

### Phase 5 — New Chat UI (Streaming + Slash Autocomplete)

The old static ChatPage has been replaced by a full Pi-powered chat at `/chat`.
`src/app/chat/page.tsx` renders `<PiChatPage />` instead of `<ChatPage />`.

**New files:**
```
src/components/pi-chat/
  pi-chat-page.tsx         # Main chat: streaming, thinking blocks, tool calls
  slash-autocomplete.tsx    # /-triggered autocomplete for skills & templates
  skills-tools-dropdowns.tsx # Read-only header dropdowns for enabled tools/skills
src/hooks/
  use-pi-stream.ts          # SSE hook for /api/pi/events/[sessionId]
```

### Phase 6 — Tool Call Rendering

Per-tool rendering extracted from pi-chat-page.tsx into dedicated modules:

**New files:**
```
src/components/pi-chat/
  tool-call-card.tsx                 # Collapsible card, status icons, per-tool render
  tool-result-renderers.tsx          # bash→terminal, read→file+preview, edit→diff, write→creation
  tool-call-card.test.tsx            # 13 tests
  tool-result-renderers.test.tsx     # 20 tests
```

33 tests across 2 files, all pure-logic or component tests with no DB/network.

### Phase 7 — Model & Settings Controls

Model selector + thinking level toggle + status bar integrated into the Pi chat header.

**New/modified files:**
```
src/components/pi-chat/
  model-selector.tsx          # Modal: search + provider filter + Pi model registry
  model-selector.test.tsx     # 8 tests
  status-bar.tsx              # Header: model badge, thinking dropdown, context bar, stats
  status-bar.test.tsx         # 8 tests
  pi-chat-page.tsx            # MODIFIED — integrated ModelSelector + StatusBar
src/app/api/pi/state/
  [sessionId]/route.ts        # GET available models/stats, PUT model/thinking level
  [sessionId]/route.test.ts   # 11 tests
src/lib/pi/
  process-manager.ts          # MODIFIED — added sendAndWait() method
  event-types.ts              # MODIFIED — RpcResponse added to PiEvent union
```

27 new tests + 1325 passing overall (1 pre-existing failure in scraper).

### Phase 8 — Session Persistence & Management

Persistent Pi sessions with a collapsible session sidebar.

**New/modified files:**
```
src/components/pi-chat/
  session-sidebar.tsx          # Collapsible panel: list, rename, delete, switch sessions
  session-sidebar.test.tsx     # 11 tests
  pi-chat-page.tsx             # MODIFIED — sidebar toggle + session switch handlers
src/app/api/pi/sessions/
  route.ts                     # GET list + POST rename Pi sessions
  route.test.ts                # 7 tests
  [id]/route.ts                # DELETE session (path-traversal safe)
  [id]/route.test.ts           # 3 tests
src/lib/pi/
  process-manager.ts           # MODIFIED — spawns with --session for persistence
```

21 new tests + 1346 passing overall.

## New directories added in Phase 14 (Scheduled Agent Tasks)

```
src/lib/agent-task-scheduler.ts      # Cron-based scheduler for agent tasks
src/lib/agent-task-scheduler.test.ts # 9 lifecycle + runOnce integration tests
src/lib/pi/pi-path.ts                # Shared pi binary path resolution (extracted)
src/lib/pi/pi-path.test.ts           # Path resolution tests
src/lib/pi/headless-prompt.ts        # Pure: build spawn args + headless directive
src/lib/pi/headless-prompt.test.ts   # 18 argv-combination tests
src/lib/pi/json-event-renderer.ts    # Pure: pi JSON events → readable transcript
src/lib/pi/json-event-renderer.test.ts # 28 event-type rendering tests
src/app/agent-tasks/                 # Page shell
src/app/api/agent-tasks/             # API routes (list/create/update/delete/toggle/run/resources)
src/app/api/agent-tasks/route.test.ts # 23 route tests
src/components/agent-tasks/
  agent-tasks-page.tsx               # Task list + card controls (toggle/edit/delete/run)
  agent-task-form.tsx                # Create/edit form: cron builder, tools/skills toggles, model
  agent-task-runs.tsx                # Collapsible history runs panel
  agent-task-types.ts                # Shared TS types
```

### Architecture

Scheduled agent tasks use **`pi -p "<prompt>" --mode json`** (print+JSON mode, not the RPC singleton):
- The scheduler spawns pi as a child process, pipes stdout, and parses each JSON event line.
- Events are rendered to a human-readable transcript via `renderJsonEvent()`.
- The transcript is stored in the `History` table (with incremental flush every 1.5s) for per-run review.
- The **Log Viewer** has an "Agent Tasks" service that returns DB-backed transcripts (no journalctl).
- Agent errors count toward the log-alert badge via `countErrorsInAgentTaskHistory()`.

### Safety (dangerous tools)

- Per-task tool allowlist defaults to **safe read-only tools** (`read, grep, find, ls`).
- Mutating tools (`bash, edit, write`) are OFF by default and must be explicitly enabled per task.
- The headless directive (appended via `--append-system-prompt`) makes the agent aware it's
  running unattended on a cron — it must not expect user interaction or halt on approval prompts.

### API surface

| Method | Path | Purpose |
| ------ | ------------------------------------------ | --------------------------------------------- |
| GET | `/api/agent-tasks` | List tasks + tool/skill catalog |
| POST | `/api/agent-tasks` | Create task |
| GET | `/api/agent-tasks/[id]` | Get single task |
| PUT | `/api/agent-tasks/[id]` | Update task (prompt/cron/tools/skills/model/…) |
| DELETE | `/api/agent-tasks/[id]` | Delete task + unregister from scheduler |
| POST | `/api/agent-tasks/[id]/toggle` | Toggle enabled/disabled |
| POST | `/api/agent-tasks/[id]/run` | Run once immediately (returns 202) |
| GET | `/api/agent-tasks/[id]/runs` | Recent run history |
| GET | `/api/agent-tasks/resources` | Available tools + skills for the form |

### Scheduler

`src/lib/agent-task-scheduler.ts` mirrors the `WorkerTimerScheduler` pattern:
- In-process `CronJob` instances using the `cron` npm package.
- Overlap guard: an in-memory `Set<taskId>` prevents concurrent runs of the same task.
- Timeout: configurable per task (default 300s), SIGTERM → 5s → SIGKILL.
- Transcript streaming: flushed to `History.output` every 1.5s (Phase 9 pattern).
- History cleanup: keeps last 50 runs per task.
- Initialized in `instrumentation.ts` alongside the cron and worker-timer schedulers.

## Phase 15 — Proxmox VE Monitoring

### New directories / files added

```
src/lib/clients/proxmox.ts              # Proxmox API client (node:https, PVEAPIToken auth, snapshot aggregation)
src/lib/clients/proxmox.test.ts         # 11 tests (envelope unwrap, auth header, TLS toggle, snapshot, offline recovery)
src/lib/pve-status.ts                   # Cache + getClusterSnapshot (DB load → parallel fanout → 15s in-memory cache)
src/app/api/pve/status/route.test.ts    # 4 tests (empty, happy, failure, disabled) on getClusterSnapshot via the route
src/app/api/pve/endpoints/route.test.ts # 12 tests (CRUD + masking + validation)
src/app/api/pve/endpoints/              # CRUD: list/create endpoint
src/app/api/pve/endpoints/[id]/         # CRUD: get/update/delete endpoint
src/app/api/pve/status/                 # GET aggregated snapshot across all enabled endpoints (15s in-memory cache)
src/app/pve/page.tsx                    # Page shell
src/components/proxmox/
  proxmox-types.ts                      # Shared TS types (PveNode, PveGuest, PveEndpoint)
  proxmox-page.tsx                      # Main client component: polls /api/pve/status every 30s, settings toggle
  node-card.tsx                         # Node row with expandable VM/LXC/Storage drill-down tabs
  endpoint-settings.tsx                 # Modal-based CRUD for Proxmox API endpoints
prisma/migrations/20260724190039_add_proxmox_endpoints/
  migration.sql                         # ProxmoxEndpoint model (id, name, apiUrl, apiToken, verifyTls, enabled, order)
```

### Data source

[Proxmox VE REST API v2](https://pve.proxmox.com/pve-docs/api-viewer/) — each configured endpoint is an
independent Proxmox cluster or standalone host. The client connects to the
`/api2/json/*` namespace with an API token (`Authorization: PVEAPIToken=<user>!<name>=<secret>`).

| Endpoint | Aggregated into |
| -------- | --------------- |
| `GET /nodes` | List of cluster nodes with CPU/mem/disk/uptime |
| `GET /nodes/{node}/qemu` | Per-node QEMU VMs (vmid, name, status, cpu, mem, disk) |
| `GET /nodes/{node}/lxc` | Per-node LXC containers (same shape as VMs) |
| `GET /nodes/{node}/storage` | Per-node storage pools (type, total, used, avail) |

All per-node requests run in parallel. Offline nodes skip guest/storage
queries gracefully. Per-node errors (e.g. one guest endpoint fails) don't
block the rest — the caller gets empty arrays for the failed category.

### Configuration

Endpoints are stored in the `ProxmoxEndpoint` database table and managed
through the Proxmox dashboard's inline settings panel (`Manage Servers`
button at `/pve`). Each entry stores:

| Field | Description |
| ----- | ----------- |
| `name` | Human label (e.g. "Main Cluster") |
| `apiUrl` | `https://<host>:8006` |
| `apiToken` | Full token (`root@pam!monitor=xxx` — stored securely, masked in API responses) |
| `verifyTls` | Toggle TLS cert verification (off for self-signed Proxmox certs) |
| `enabled` | Skip disabled endpoints on the status snapshot |

### Caching

`GET /api/pve/status` uses an in-process 15-second TTL cache (`module`-level
object, not Promise-backed). Since it serves both the dashboard page (30s
poll) and future sidebar badge, this prevents redundant Proxmox API calls
within the window. The cache is per-process and resets on server restart.

### Dashboard sorting

Expanded node tables sort client-side from their column headers. VM and LXC tables
sort by ID, name, status, CPU, memory utilization, disk utilization, or uptime;
storage tables sort by name, type, utilization, or free space. Each node/tab keeps
its own ascending/descending sort state across status refreshes. Guest tables default
to ID ascending and storage defaults to name ascending.

### API surface

| Method | Path | Purpose |
| ------ | -------------------------------------------- | --------------------------------------------- |
| GET | `/api/pve/endpoints` | List all endpoints (tokens masked) |
| POST | `/api/pve/endpoints` | Create endpoint |
| GET | `/api/pve/endpoints/[id]` | Get single endpoint |
| PUT | `/api/pve/endpoints/[id]` | Update endpoint (blank token = keep existing) |
| DELETE | `/api/pve/endpoints/[id]` | Delete endpoint |
| GET | `/api/pve/status` | Aggregated snapshot across all enabled endpoints |

### Security

- API tokens are stored as plain text in the SQLite DB (same as
  `real_debrid_api_key` in the Config model). The list/GET endpoints
  mask all but the last 4 characters.
- The PUT endpoint treats an empty/absent `apiToken` as "keep existing",
  so the frontend never needs to send the full token back.
- `verifyTls: false` disables TLS verification for Proxmox's default
  self-signed certificate (common in homelab setups).

## Docker Logs — multi-instance Dozzle viewer

Docker Logs combines independent Dozzle instances without Dozzle agent federation. Endpoint
URLs are stored in the `dozzle_endpoints` table and managed at `/docker-logs`; MC pass-through
routes are required because Dozzle does not emit CORS headers. The browser merges each
endpoint's `/api/events/stream`, fetches JSONL backfill from `/logs?min=...`, and keeps the
live `/logs/stream` SSE open. The page is LAN-oriented and has no sidebar badge or container
actions.

### Files

```
prisma/migrations/20260817120000_add_dozzle_endpoints/migration.sql
src/lib/docker-logs.ts                         # Upstream types, URL/query builders, log decoding
src/app/docker-logs/page.tsx                   # /docker-logs shell
src/app/api/docker-logs/endpoints/             # Endpoint CRUD + Dozzle SSE/JSONL pass-through
src/components/docker-logs/                     # Page, settings modal, native log viewer
```

### API surface

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET/POST | `/api/docker-logs/endpoints` | List/create Dozzle endpoints |
| GET/PUT/DELETE | `/api/docker-logs/endpoints/[id]` | Read/update/delete one endpoint |
| GET | `/api/docker-logs/endpoints/[id]/events/stream` | Pipe Dozzle container events/stats SSE |
| GET | `/api/docker-logs/endpoints/[id]/containers/[containerId]/logs` | Pipe bounded JSONL backfill |
| GET | `/api/docker-logs/endpoints/[id]/containers/[containerId]/logs/stream` | Pipe live log SSE |

## Local Arrs — local library browser

A one-glance browser for the **local** Sonarr/Radarr instances (SonarrLocal,
RadarrLocal). Lists every show/movie with its size on disk, file count, and a
quick link to the item's page in the configured Arr instance. Sizes are the
values **reported by Arr itself** (Sonarr `statistics.sizeOnDisk` /
`episodeFileCount`, Radarr `sizeOnDisk` / `movieFileCount`) — no filesystem
scan, no new worker.

### Files

```
src/lib/local-arrs.ts                 # LOCAL_ARRS registry (slug → label/type/path/itemLabel),
                                      # LocalArrItem/LocalArrLibrary types, isLocalArrSlug guard
src/app/local-arrs/page.tsx           # /local-arrs page shell (AppShell noScroll)
src/app/api/local-arrs/library/route.ts  # GET ?instance=sonarrlocal|radarrlocal
src/components/local-arrs/
  local-arrs-page.tsx                  # Client component (dropdown, filter, sort, search, totals)
```

`src/lib/clients/arr.ts` gained optional `sizeOnDisk` / `statistics` fields on
the `ArrMovieResponse` and `ArrSeriesResponse` types used for normalization.

### API surface

| Method | Path | Purpose |
| ------ | ------------------------------------------ | ------------------------------------------- |
| GET | `/api/local-arrs/library?instance=...` | Normalized library for SonarrLocal or RadarrLocal; `Cache-Control: no-store` |
| POST | `/api/local-arrs/series/{id}/delete-files?instance=sonarrlocal` | Enumerate episode files then bulk-delete them (keeps the series) |
| DELETE | `/api/local-arrs/series/{id}?instance=sonarrlocal` | Delete the series AND its files |
| POST | `/api/local-arrs/series/{id}/monitor?instance=sonarrlocal` | Set monitoring via SeasonPass; body `{ monitor: "all"\|"future"\|"missing"\|"existing"\|"firstSeason"\|"latestSeason"\|"none" }` |
| POST | `/api/local-arrs/series/{id}/future-and-delete-files?instance=sonarrlocal` | Set Future, then delete all episode files while keeping the series |

Returns `{ instance, label, itemLabel, items: [{ id, title, sizeOnDisk, fileCount, href }], totalItems, totalSize }`.

- URL + API key resolved via `resolveConfig()` (env > DB > default), the same
  path every other Arr consumer uses.
- Deep links are `{configuredUrl}/series/{titleSlug}` (Sonarr) or
  `{configuredUrl}/movie/{titleSlug}` (Radarr) — built from the **configured**
  instance URL, so links and API calls always point at the host you set in
  `/admin/config`.
- Status codes: `400` unknown slug, `503` no API key configured for the
  instance, `502` upstream Arr fetch failure.

### Page UX

- Instance dropdown (SonarrLocal default) + "Show Empty Shows" checkbox (off
  by default — hides items with zero files). Both persist in a versioned
  localStorage key `mission-control:local-arrs:v1` (theme-system pattern).
- Header totals always reflect the **whole library** (count + total size),
  unaffected by the empty filter or the search box.
- Sort by size (desc default) or name (asc/desc toggle), plus a text search.
  Click handlers live on the column-header buttons.
- Fetch on load + a Refresh button in the header; no polling (sizes barely
  change minute-to-minute).
- Down instance → full-page error panel with Retry; a stale-response guard
  (`requestId` ref) prevents a slow previous fetch from clobbering a newer one.

### Slug guard note

`isLocalArrSlug()` uses `Object.hasOwn(LOCAL_ARRS, value)` — **not** the `in`
operator. The `in` operator walks the prototype chain, so `?instance=toString`
(or `constructor`/`valueOf`) would otherwise pass the guard and degrade into a
503 with an "undefined is not configured" message.

### Sonarr per-series actions (destructive)

Sonarr rows expose an **Actions** column (Radarr rows do not) with four
buttons, each behind a `ConfirmDialog`:

| Button | Sonarr API | Effect |
| ------ | ---------- | ------ |
| Delete Files | `GET /episodefile?seriesId=` → `DELETE /episodefile/bulk` | Removes all episode files; series stays. Optimistically zeroes size + file count. |
| Delete Series + Files | `DELETE /series/{id}?deleteFiles=true` | Removes the series entirely + its files. Row dropped optimistically. |
| Set Future | `POST /seasonPass { monitoringOptions: { monitor: "future" } }` | Recomputes per-episode monitored flags. SeasonPass is the **only** documented path that re-applies monitoring to an *existing* series — `addOptions.monitor` is add-time only and is never stored, so editing the series via `PUT /series/{id}` won't re-render monitoring. |
| Set Future + Delete Files | `POST /series/{id}/future-and-delete-files` | Runs SeasonPass first, then bulk-deletes episode files; keeps the series and reports partial success if deletion fails after monitoring changes. |

Behind a delete-files success the UI emits a tip toast nudging **Set Future**,
because deleting files leaves episodes monitored & missing — Sonarr would
otherwise re-grab them. The combined action performs the safer order—Future
first, files second—with one confirmation. Routes reuse the shared
`resolveLocalArrClient()` resolver (`src/app/api/local-arrs/_shared.ts`); 400
on bad id/slug/monitor, 503 on missing key, 502 on upstream failure.

