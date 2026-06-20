# ServerTool → Mission Control: Replication Guide

This document is a page-by-page, subsystem-by-subsystem guide for re-implementing the
**ServerTool** Go application as **Mission Control** (Next.js + TypeScript + Prisma + Bun).

It is written so that each **Part** can be handed to a separate agent and worked in
parallel. No code is included — only scope, data contracts, UI breakdown, behavior, and
acceptance checks. Source references point at the original Go files so an agent can consult
the exact implementation when needed.

> Source repo: `~/ServerTool`
> Target repo: `~/mission-control` (this project)
> Authoritative conventions: `~/mission-control/AGENTS.md` and
> `~/ServerTool/context/coding-standards.md` (Next.js / Tailwind v4 / Prisma standards).

---

## 0. How to read this guide

### 0.1 Architecture translation

| ServerTool (Go)                        | Mission Control (TS / Next.js)                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| Chi router + handlers                  | Next.js App Router pages + `src/app/api/*/route.ts`             |
| `templ` server-rendered HTML + HTMX    | React Server Components + Client Components (no HTMX)           |
| SQLite + `sqlc` generated queries      | SQLite + **Prisma** (`prisma migrate`)                          |
| Gorilla WebSocket (`/ws`) live output  | WebSocket or **Server-Sent Events** endpoint for terminal stream |
| `robfig/cron` in-process scheduler     | In-process scheduler started in a server module / instrumentation |
| Background scraper goroutine (3h loop) | `src/workers/*-scraper.ts` run-once tasks via systemd timer     |
| `fsnotify` file-tree scanner goroutine | `src/workers/file-scanner.ts` run-once task via systemd timer   |
| Agent binary connects back over WS     | (Phase 2) Agent system — see Part 11                             |
| Tabulator / Sortable / Material Web    | Native React + Tailwind (shadcn/ui where applicable)            |

### 0.2 Stack rules (must follow)

- **Next.js App Router**, React 19, **Bun** runtime.
- **Tailwind CSS v4** — NO `tailwind.config.ts`. Theme via `@theme` in
  `src/app/globals.css`.
- **Prisma** for all DB access. Migrations via `prisma migrate dev` / `deploy`.
- Server Components by default; `'use client'` only for interactivity.
- API routes for webhooks, long-running ops, third-party integrations, specific status
  codes. Otherwise fetch directly in server components / use Server Actions.
- Validate inputs with **Zod**. Strict TS, no `any`.
- File org: `src/components/[feature]/`, `src/app/[route]/`, `src/lib/[util].ts`,
  `src/types/[feature].ts`, `src/workers/`, `scripts/`.

### 0.3 Design system (mirror exactly)

Dark, "terminal/cyber" aesthetic. Capture these tokens in `src/app/globals.css` via
`@theme` and CSS custom properties (see `~/ServerTool/cmd/web/views/layout.templ`).

Colors:
- `primary` `#00FF9C`, `primary-dim` `#00E38A`, `primary-fixed` `#56FFA7`
- `secondary` `#c0c6db`, `tertiary` `#4CD6FF`, `error` `#FFB4AB`
- `bg` `#0E0E0E`, `surface` `#131313`, `surface-low` `#1C1B1B`,
  `surface-container` `#201F1F`, `surface-container-high` `#2A2A2A`,
  `surface-container-lowest` `#0E0E0E`
- `on-primary` `#002110`, `on-surface` `#E5E2E1`, `on-surface-variant` `#849587`,
  `outline-variant` `#3B4B3F`

Fonts: `Inter` (body), `Space Grotesk` (headings), `JetBrains Mono` (mono/terminal).
Icons: Material Symbols Outlined.

Recurring visual primitives to build as shared components:
- `.btn-primary` (gradient glow on hover), `.btn-ghost` (outline).
- Terminal panel with scanline overlay + inner glow (`terminal-scanline`, `terminal-glow`).
- Status pills (success / failed / running) with the colored border + faint bg.
- Glassmorphism modal (`backdrop-blur`, semi-transparent surface).
- Toast (top-right, success/error/info variants).
- `prefers-reduced-motion` respected; fade-up stagger entrance animations.

### 0.4 Global shell / layout

Every page shares a **left sidebar** + main content area (see
`layout.templ → SidebarContent`). The sidebar contains:
- Brand "ServerTool" (rename to "Mission Control") + version + uptime.
- A collapsible **Macros** section listing every macro grouped by `macro_group`,
  each clickable to run that macro (see Part 3 home + Part 4 admin for macro data).
- Nav items: History, Schedules, NZB Viewer, Debrid Viewer, Server Status, Log Viewer,
  Database, Admin, Config, Scraper.
- A Real-Debrid status badge at the bottom (fetches `/api/real-debrid/status`).
- Mobile: collapsible drawer + top header with hamburger.

There is also a right "Macros" rail on the **home** page only (`MacroSidebarRight`).
An **agent selection modal** is global (for "Run on Agent" macros with no fixed agent).

> **Agent task (Part 1):** build the shared layout shell + design system + global UI
> primitives + sidebar nav + toast + agent modal. This is a hard dependency for every
> page.

---

## Part dependency graph (suggested parallelization)

```
Part 0  (design system + globals.css + Prisma schema)   ← foundation, do first/parallel
Part 1  (layout shell + sidebar + shared components)     ← depends on Part 0
Part 2  (Prisma data layer + typed query helpers)        ← depends on Part 0
Part 3  (Home / Terminal)            depends on 1,2 + WS engine (Part 9)
Part 4  (Admin / Macros CRUD)        depends on 1,2
Part 5  (History)                    depends on 1,2
Part 6  (Schedules + cron engine)    depends on 1,2 + Part 10
Part 7  (NZB + Debrid viewers)       depends on 1,2 + Part 12 (file scanner)
Part 8  (Scraper page)               depends on 1,2 + Part 13 (scraper workers)
Part 14 (Database viewer)            depends on 1,2
Part 15 (Config)                     depends on 1,2
Part 16 (Server Status)              depends on 1,2 + Part 11 (agent system)
Part 17 (Log Viewer)                 depends on 1
Part 9  (Real-time WS/SSE + macro run engine)  depends on 2
Part 10 (Cron scheduler service)     depends on 2,9
Part 11 (Agent remote-exec system)   depends on 2,9  (Phase 2 — can stub status page first)
Part 12 (File-tree scanner worker)   depends on 2
Part 13 (Scraper workers)            depends on 2 + lib clients (Part 2.5)
Part 18 (One-off TS scripts)         depends on 2 + lib clients
```

Parts 3–8 and 14–17 are **page parts** and can all be built in parallel once
Parts 0–2 are done. Parts 9–13 are **engine/worker parts** that some pages depend on.

---

## Part 0 — Foundation: design system, Prisma schema, shared types

**Scope:** establish the non-page groundwork every other part needs.

### 0.A Design system
- Add Google Fonts (Inter, Space Grotesk, JetBrains Mono, Material Symbols) via `layout.tsx`.
- Implement `src/app/globals.css` with Tailwind v4 `@import "tailwindcss";` + `@theme`
  block mapping the color tokens from §0.3.
- Add base body styles (dark bg, font smoothing), custom thin scrollbars, focus-visible
  ring (`box-shadow` using primary), reduced-motion handling, the fade-up keyframes, and
  the terminal scanline/glow utility classes.

### 0.B Prisma schema
Mirror the SQLite schema from `~/ServerTool/cmd/web/main.go` (the `initDB` schema block)
and `~/ServerTool/schema.sql`. Tables:

- `macros`: `id`, `name`, `description`, `group_name`, `ord`, `run_on_agent` (bool),
  `agent_hostname`, `commands` (JSON string of `[{ord,cmd,working_dir}]`).
- `macro_groups`: `id`, `name` (unique), `ord`.
- `history`: `id`, `macro_id` (FK), `start_time`, `end_time?`, `status`
  (`running`|`success`|`failed`), `output?`, `triggered_by` (default `user`).
- `schedules`: `id`, `macro_id` (FK), `cron_expression`, `enabled` (default true),
  `created_at`.
- `server_agents`: `id`, `hostname` (unique), `ip_address?`, `cpu_usage?`,
  `memory_total?`, `memory_used?`, `last_seen?`, `version?`, `update_requested`,
  `restart_requested`, `network_sent`, `network_recv`.
- `scrape_results`: `id`, `source`, `title`, `image_url?`, `magnet_link?`,
  `torrent_link?`, `unique_key` (unique), `info_hash?`, `file_size?`, `tags?`,
  `is_hidden`, `is_downloaded`, `hidden_at?`, `created_at`.
  (Legacy `scraped_items` + `scraped_item_files` may be skipped — `scrape_results`
  supersedes them; only carry over if a migration is needed.)
- `file_checks`: `id`, `file_path` (unique), `last_checked?`, `broken_count`,
  `is_ignored`, `error_message?`, `created_at`.
- `nzb_files`: `id`, `path` (unique), `name`, `is_dir`, `parent_path`, `link_target?`,
  `file_count`, `updated_at`. Indexes on `parent_path`, `name`.
- `debrid_files`: same shape as `nzb_files`.
- `settings`: `key` (PK), `value`.
- `configs`: `id`, `config_json` (default `{}`), `updated_at`. Seed row id=1.

Enable SQLite WAL. Generate the first migration.

### 0.C Shared TypeScript types
Create `src/types/*.ts` mirroring the clean JSON shapes from
`~/ServerTool/cmd/web/handler/response_types.go`:
`Macro`, `MacroGroup`, `MacroCommand` (`{ord,cmd,working_dir}`), `History`,
`Schedule`, `ServerAgent`, `ScrapeResult`, `NzbFile`/`DebridFile` (`{id,path,name,
is_dir,parent_path,link_target?,file_count?,updated_at?}`), `Config`.
Use nullable fields (`string | null`) for the `*`-pointer fields.

### 0.D Env / config
- `.env`: `DATABASE_URL`, `WEB_PORT`, `TORBOX_API_TOKEN`, `PLEX_TOKEN`, `PLEX_URL`,
  `PLEX_WATCHLIST_RSS`, `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`, plus config-dir
  overrides. Mirror `~/ServerTool/.env.example`.
- `src/lib/config.ts` to load + validate (Zod) the runtime config (Arr instances list,
  media paths, rclone path, torbox key) — see `~/ServerTool/config/config.go` and
  `agents.md → Configuration Reference` for the default Arr instances + media dirs.

**Acceptance:** `bun prisma migrate dev` succeeds; `just typecheck` passes; the app boots
with a styled blank shell.

---

## Part 1 — Layout shell, sidebar, shared components

**Source:** `~/ServerTool/cmd/web/views/layout.templ`
**Depends on:** Part 0.

Build `src/app/layout.tsx` (root) and a `AppShell` server/client component:

- **Sidebar (desktop, 240px)** + **mobile drawer** (280px, slide-in with backdrop).
  Both render `SidebarContent`.
- `SidebarContent`: brand + version + uptime; collapsible Macros list (grouped);
  nav items with active-state highlight (color accents per item as in original);
  Real-Debrid badge at bottom (loads from `/api/real-debrid/status`).
- `NavItem` component (icon + label, active bg).
- Macro list: groups as sub-headers, each macro a clickable row that triggers a run
  (calls `/api/run/{id}` or, for "Run on Agent" macros, opens the agent modal / uses the
  macro's fixed `agent_hostname`). See Part 3 for the run mechanics.
- Global **Toast** utility (imperative `showToast(msg, type)`).
- Global **Agent selection modal**: fetches `/api/agents/options` (list of hostnames),
  lets user pick, then runs macro on that agent.
- Reusable UI primitives in `src/components/ui/`: `Button` (primary/ghost), `StatusPill`,
  `Modal` (glassmorphism), `Terminal` (scanline+glow), `IconButton`, `TextInput`,
  `Select`, `ToggleSwitch`, `EmptyState`, `DataTable` (generic, since many pages use
  tables), `ConfirmDialog`.

**Acceptance:** visiting `/` shows the shell with sidebar, nav, mobile drawer works,
toasts fire, agent modal opens.

---

## Part 2 — Prisma data layer + lib clients

**Source:** `~/ServerTool/pkg/*`, `~/ServerTool/cmd/web/handler/arr_client.go`,
`~/ServerTool/query.sql`, `~/ServerTool/cmd/web/handler/response_types.go`.

### 2.A Query helpers
Create `src/lib/db/*.ts` with typed functions wrapping Prisma for every operation the
pages/engines need: grouped macros (groups + macros ordered, auto-create "Ungrouped"),
macro CRUD, command reorder, group CRUD/reorder/move, history list/detail/create/update/
clear, schedule list/create/update/toggle/delete, agent list/get-by-hostname/upsert,
scrape results list/create/hide/undo/download/cleanup, nzb/debrid file tree
list/search/delete, settings get/set, config get/upsert, database table introspection
(list tables, list columns, select first 100 rows with per-column filters).

### 2.B Shared lib clients (`src/lib/clients/`)
Port these Go client packages to TS (HTTP fetch wrappers):
- **Arr client** (`arr_client.go`): generic Sonarr/Radarr v3 API (`/api/v3/...` with
  `X-Api-Key`). Methods used by pages/engines: list movies, list series, wanted/missing,
  lookup, add series/movie, trigger commands (`MoviesSearch`, `EpisodeSearch`,
  `SeasonSearch`, `SeriesSearch`), delete movie/series. Also the **Arr instance→URL
  mapping** cache used by NZB/Debrid viewers to turn a folder name into an Arr deep link
  (refresh every 10 min).
- **Decypharr client** (`pkg/decypharr`): `addMagnet`, `addTorrent` against
  `http://192.168.1.99:8282` (configurable). Used by scraper download flow.
- **Torbox client** (`pkg/torbox`): `checkCached(hashes[])`, `extractHashFromMagnet`.
  `POST https://api.torbox.app/v1/api/torrents/checkcached` with `TORBOX_API_TOKEN`.
- **Real-Debrid client** (`pkg/realdebrid` + `context/resources/api-real-debrid-com.md`):
  `getUser` (for status badge — premium days remaining), and any methods used by
  `realdebrid_migrate`.
- **Plex client**: OAuth PIN flow, hubs (`continueWatching`), watchlist RSS, library
  listing, used by Plex workers (Part 18) and possibly a future Plex page.
- **Trakt client**: device-code flow + watched-shows export (Part 18).
- **CineSync client**: auth + file details + skip-processing (Part 18).

**Acceptance:** each client has typed methods and a small smoke test or script; Arr
mapping cache loads.

---

## Part 3 — Home page: Terminal dashboard

**Route:** `/` · **Source:** `home.templ`, `command.go`, `ws.go`, `layout.templ → HomeLayout`

### Purpose
The landing page is a live terminal that streams macro execution output in real time.
Clicking a macro in the sidebar runs it and its stdout/stderr streams here.

### Layout
- `HomeLayout`: left sidebar + main terminal + a right **Macros rail** (220px, xl+ only).
- Terminal chrome bar: three dots, "terminal — ServerTool" label, fake session id.
- Terminal output area (`#textbox`): mono font, scanline+glow, autoscroll-to-bottom,
  clear/export buttons, "CONNECTED" indicator (green when WS open, red when closed).
- The right rail lists macros grouped (same component as sidebar macro list).

### Behavior
- On load, open a WebSocket (or SSE) to the live-output endpoint (Part 9). Append
  incoming bytes/text to the terminal. Support a `"reload"` control message.
- Reconnect with 3s backoff on close.
- Track scroll: only auto-scroll if user is at bottom.
- Running a macro: sidebar click → `POST /api/run/{id}` (optionally `?agent=...`).
  Server runs the macro and streams output to all connected clients.
- If a macro is "Run on Agent" with no fixed agent → open the global Agent modal first.
- Deep link: `/?run_macro={id}&agent={host}` auto-runs on load (then cleans URL).

### Data/API needed
- `GET /api/macros` (grouped) for the rails.
- `POST /api/run/{id}` to trigger.
- Live stream endpoint (Part 9).

### Agent tasks
1. Build the terminal UI + right rail using Part 1 primitives.
2. Implement the WS/SSE client hook (`useLiveTerminal`) against Part 9's endpoint.
3. Wire sidebar macro clicks → run + stream.
4. Implement `?run_macro=` deep-link handling + agent-modal flow.

**Acceptance:** clicking a macro streams its live output; reconnects on disconnect;
deep-link auto-runs; export/clear work.

---

## Part 4 — Admin page: Macro & group CRUD

**Route:** `/admin` · **Source:** `admin.templ`, `admin.go` (1196 lines),
`views/types.go`.

### Purpose
Full CRUD for macros, commands inside macros, and macro groups, with drag-and-drop
reordering and inline editing.

### UI breakdown
- Header: "Admin" + actions: **Compress All**, **Expand All**, **New Group**, **New
  Macro** (opens modal).
- List of **groups**, each a card with: group name, move up/down, edit, delete; a table
  of its macros.
- Each **macro row**: drag handle, expand arrow, name, "Agent" badge + hostname chip if
  `run_on_agent`, description, edit/delete actions. Clicking the row toggles its commands.
- Expanded commands panel (lazy-loaded): list of `MacroCommand` cards (`cmd`, working
  dir, drag handle, edit/delete) + "Add" button. Empty state when none.
- **New Macro modal**: name, group select, description, initial command, "Run on Agent"
  checkbox + agent hostname select.
- **Edit Macro form** (inline, replaces row): same fields.
- **Edit Command form**: order, command (with a `<datalist>` of shortcut suggestions),
  working directory.

### Interactions (replace HTMX with React state + Server Actions/API)
- Drag-reorder commands within a macro → `POST /api/macros/{id}/commands/reorder` (or
  Server Action) with the new index order.
- Drag-reorder macros across groups → `POST /api/macros/reorder` with `group_id` +
  `macro_ids[]`.
- Move group up/down → reorder groups.
- Create/edit/delete macro, create/edit/delete group, add/edit/delete command.
- All mutations optimistically update UI and re-fetch grouped macros.

### Data/API
- `GET /api/macros` (grouped), `POST /api/macros`, `GET/PUT/DELETE /api/macros/{id}`,
- `GET /api/macros/{id}/commands`,
- `POST /api/macros/groups`, `PUT/DELETE /api/macros/groups/{id}`,
- reorder endpoints (add to the API surface even if not in the original JSON API).
- `GET /api/agents/options` for the agent selects.
- Command "shortcuts" suggestion list — expose via a settings/constants endpoint or
  hardcode a known list (consult `admin.go` for the shortcut source).

### Agent tasks
1. Build group/macro/command list UI with expand/collapse + compress/expand all.
2. Implement drag-and-drop (e.g. `@dnd-kit`, already in frontend node_modules) for both
   commands and macros-across-groups.
3. Build New/Edit macro modals + New/Edit/Delete command forms.
4. Wire all mutations through Server Actions / API routes with Zod validation + toast
   feedback.

**Acceptance:** full CRUD works, drag reorder persists, agent assignment works,
expanding a macro loads its commands.

---

## Part 5 — History page

**Routes:** `/history`, `/history/{id}` · **Source:** `history.templ`, `history.go`.

### `/history` — list
- Header "Command History" + **Clear History** button (confirm, then
  `DELETE /api/history`).
- Table columns: Macro Name, Status (pill), Triggered By (`user`/`schedule`),
  Start Time (`Jan 02, 15:04:05`), Duration (end−start rounded to sec, `—` if running),
  Actions (View Logs link).
- Sorted newest first.

### `/history/{id}` — detail
- Back arrow + "Log: {macroName}" + status pill.
- Started time + duration.
- Full output in a terminal panel (mono, scanline, `whitespace-pre-wrap`); "No output
  recorded" empty state.

### Data/API
- `GET /api/history`, `GET /api/history/{id}`, `DELETE /api/history`.

### Agent tasks
Build list + detail pages, status pill component reuse, time/duration formatting, clear
with confirm.

**Acceptance:** list renders, clear works, detail shows full output.

---

## Part 6 — Schedules page + cron engine

**Routes:** `/schedules`, `/schedules/{id}/edit` · **Source:** `schedules.templ`,
`schedules.go`, `cron/cron.go`, `handler.go → Scheduler`. **Depends on:** Part 10.

### `/schedules` — list + new form
- "New Schedule" card: Macro select, **Frequency** select (`interval`/`daily`/`weekly`)
  with conditional fields:
  - interval → Every (number) + Unit (minutes/hours) → cron `*/N * * * *` or
    `0 */N * * *`.
  - daily → At Time (`HH:MM`) → `MM HH * * *`.
  - weekly → At Time + On Day (Mon–Sun, DOW 1..6,0) → `MM HH * * DOW`.
  - Submit → `POST /api/schedules` with computed `cron_expression`.
- Existing schedules list: each row has a **toggle switch** (enabled/disabled), macro
  name, cron expression (mono, green), Edit + Delete buttons. Disabled rows dimmed +
  "Disabled" tag.

### `/schedules/{id}/edit`
- Same form pre-filled; parse the existing cron back into form values (reverse the
  mapping above). Submit → `PUT /api/schedules/{id}`.

### Cron engine (Part 10) integration
- Toggling enabled → `POST /api/schedules/{id}/toggle` adds/removes from the in-process
  scheduler.
- Create/update/toggle must register/remove the cron entry with the scheduler service.
- Triggered runs record `triggered_by: "schedule"` in history.

### Data/API
- `GET /api/schedules`, `POST`, `PUT /api/schedules/{id}`,
  `POST /api/schedules/{id}/toggle`, `DELETE /api/schedules/{id}`.

### Agent tasks
1. Build the form with conditional field logic + cron builder/parser helpers in
   `src/lib/cron.ts`.
2. Build the list with toggle switches + edit/delete.
3. Wire to Part 10 scheduler so mutations register/unregister jobs.

**Acceptance:** create a schedule, it fires on time, toggle disables it, edit updates
the next fire time.

---

## Part 7 — NZB Viewer & Debrid Viewer

**Routes:** `/nzb`, `/debrid` (+ tree/search/delete API) · **Source:** `nzb.templ`,
`debrid.templ`, `nzb.go`, `debrid.go`, `scanner.go`. **Depends on:** Part 12 (scanner).

These two pages are structurally identical — build once as a reusable `FileTreeViewer`
component parameterized by source (`nzb` | `debrid`).

### UI
- Title + filter search box (debounced 300ms → `/api/{source}/search?q=`).
- Buttons: **Collapse All**, **Expand Files**, **Delete Selected** (opens confirm modal
  listing selected paths).
- Table: checkbox column (select-all header) + Name column rendered as an indented tree.
- Directory rows: chevron toggle (lazy-load children via
  `/api/{source}/tree?parent=`), folder icon, name, optional **Arr deep-link** icon
  (from the Arr name→URL cache) + file-count badge.
- File rows: file icon + mono name.
- Lazy expand: clicking a dir fetches its children and inserts them indented by depth
  (`padding-left: depth*20px`). Collapse/expand all operate on loaded rows.

### Delete flow
- Selecting a dir selects all descendants. Confirm modal lists expanded selected paths;
  submit → `POST /api/{source}/delete` with `files[]` → deletes from disk + DB.

### Data/API
- `GET /api/{source}/tree?parent=` (root when omitted), `GET /api/{source}/search?q=`,
  `POST /api/{source}/delete`.
- Tree data: `FileItem { path, name, is_dir, file_count, parent, depth }`.

### Scanner (Part 12)
The trees are populated by a background file-tree scanner that walks
`/mnt/debrid/media`, resolves symlink targets whose prefix is `/mnt/addons/nzbdav`
(nzb) or `/mnt/addons/debrid` (debrid), and upserts `nzb_files`/`debrid_files`. The page
reads from those tables.

### Agent tasks
1. Build `FileTreeViewer` (shared) + lazy-load + checkbox hierarchy + collapse/expand.
2. Build the two thin route wrappers that pass source + Arr link cache.
3. Build the delete confirm modal + API wiring.
4. Coordinate with Part 12 so trees are populated.

**Acceptance:** trees expand lazily, filter works, delete removes from disk + DB, Arr
links open.

---

## Part 8 — Scraper page

**Route:** `/scraper?source={141jav|projectjav|pornrips}` · **Source:** `scraper.templ`,
`scraper.go`, `projectjav.go`, `pornrips.go`. **Depends on:** Part 13 (scraper workers).

### Purpose
Browse scraped media cards, filter by tags, hide/download items, trigger rescrapes.

### UI / behavior (rich — read `scraper.templ` carefully)
- **Age/restricted-access gate modal** on entry: "Authorized Personnel Only" overlay;
  "Enter Site" sets a `sessionStorage` flag; re-shows after 1 min inactivity.
- Header action buttons: **Hide All** (hides all currently visible cards), **Undo**
  (un-hides last batch for the source), **Scrape All** (triggers all sources), **Scrape
  Now** (current source, shows spinner while scraping), **Clear & Rescrape**
  (deletes + rescrapes current source).
- **Tag filters**: collapsible panel of tags with counts (only tags with ≥2 occurrences);
  checkboxes filter visible cards client-side; "Clear Filters" button.
- **Source tabs**: 141JAV / ProjectJAV / PornRips (border underline accent color
  `#f43f5e`).
- **Card grid** (scroll-snap, one card per viewport): image area (PornRips shows up to 2
  images side-by-side; others single image; placeholder icon when none), "DOWNLOADED"
  badge when downloaded, title, tag chips, **DL** button (rose) + **Hide** button.
- **Keyboard nav**: `d` downloads the active (topmost visible) card, `h` hides it,
  ArrowUp/Down snap-scrolls between cards.
- **Back-to-top** floating button after scrolling.
- **Toasts** for scrape start/finish/download/hide.
- Scrape polling: after triggering, poll `/api/scraper/status?source=` (2s) and
  `/api/scraper/status-all` (3s) until `is_scraping` false, then reload.

### Card actions
- **Download** → `POST /api/scraper/download {id}` → submits magnet/torrent to
  Decypharr, marks downloaded+hidden, animates card out and snaps to next.
- **Hide** → `POST /api/scraper/hide {id}` → marks hidden, animates out.
- **Undo** → `POST /api/scraper/undo {source}` → un-hides.
- **Hide All** → hides every visible card.
- **Scrape Now / All / Clear&Rescrape** → trigger worker(s).

### Data/API
- `GET /api/scraper/results?source=`, `POST /api/scraper/trigger`,
  `POST /api/scraper/trigger-all`, `POST /api/scraper/hide`, `POST /api/scraper/undo`,
  `POST /api/scraper/download`, `POST /api/scraper/hide-all`,
  `GET /api/scraper/status`, `GET /api/scraper/status-all`.
- Result shape: `ScrapeResult { id, source, title, image, images[], magnet, torrent,
  tags[], is_downloaded }`.

### Worker dependency (Part 13)
The actual scraping (HTTP + HTML parse + Torbox cache check + DB insert) runs as worker
tasks. The page only triggers/reads. Scraping status (`is_scraping` per source) must be
queryable — implement via a `settings`/in-memory flag the worker sets (or a small status
table) since workers are separate processes. (See Part 13 for the status-sharing
approach.)

### Agent tasks
1. Build the access-gate modal + inactivity re-lock.
2. Build the toolbar (tabs, action buttons, tag filters).
3. Build the card grid with scroll-snap + keyboard nav + back-to-top.
4. Wire download/hide/undo/hide-all + scrape trigger/polling.

**Acceptance:** gate works, tabs/filters work, download→Decypharr + card animates out,
scrape polling reflects worker status, keyboard nav works.

---

## Part 9 — Real-time engine: live terminal stream + macro runner

**Source:** `command.go`, `ws.go`, `handler.go`, `agent.go`. **Depends on:** Part 2.

### Macro execution engine (`src/lib/runner.ts`)
Port `RunMacro` + `runMacroOnAgent`:
- Create a `history` row (status `running`, `triggered_by`).
- Print header (macro name, description, triggered-by, node).
- If `run_on_agent` + hostname → execute each command on the agent over WS (Part 11);
  stream `output`/`exit`/`error` messages back; 5-min per-command timeout.
- Else → run each command locally via `Bun.spawn` (`bash -c cmd`, cwd = working_dir),
  streaming stdout/stderr chunks.
- On failure → status `failed`; on completion → `success`; update history end_time +
  output.
- Broadcast every output chunk to all connected terminal clients (the home page).

### Live stream endpoint
Because Next.js route handlers are request-scoped, implement a **persistent** stream:
- Preferred: a WebSocket route (e.g. `src/app/api/ws/route.ts` using a WS upgrade) or a
  long-lived SSE stream that subscribes to an in-process pub/sub bus.
- Maintain a set of connected clients; `writeMessageToClients` fans out chunks.
- Support the `"reload"` control message (used by service-worker refresh flow — optional
  to keep, but preserve if PWA is desired).
- `POST /api/run/{id}` kicks the runner in the background (don't await in the request).

### Run API
- `POST /api/run/{id}` (optional `?agent=`): triggers `RunMacro(id, "user", agent)` and
  returns 200 immediately.

### Agent tasks
1. Implement an in-process event bus (`src/lib/live-bus.ts`) for terminal output fan-out.
2. Implement the WS/SSE route subscribing to the bus.
3. Implement `runner.ts` (local + agent paths) writing to the bus + history.
4. Implement `POST /api/run/{id}`.

**Acceptance:** running a macro streams output to all open home pages; history is
recorded with correct status; agent path works once Part 11 is done (stub gracefully
until then).

---

## Part 10 — Cron scheduler service

**Source:** `cron/cron.go`, `handler.go → Scheduler`. **Depends on:** Part 2, 9.

Implement an in-process cron scheduler started when the server boots (e.g. in
`instrumentation.ts` or a server-only module):
- On boot: load enabled schedules, register each with a TS cron lib (e.g. `cron` npm
  package) using its `cron_expression`.
- `addSchedule(id, macroId, expr)`, `removeSchedule(id)`, and on tick call
  `RunMacro(macroId, "schedule")`.
- Keep an in-memory `scheduleID → job` map with a mutex.
- The schedules API (Part 6) must call add/remove on create/update/toggle/delete.

**Acceptance:** scheduled macros run at the right times with `triggered_by: schedule`;
toggling/enabling/disabling updates the live scheduler.

---

## Part 11 — Agent remote-execution system (Phase 2)

**Source:** `cmd/agent/main.go`, `agent.go`, `agents.md → Agent System`.

> This is the largest subsystem and can be deferred. The Server Status page (Part 16)
> can be built first against the `server_agents` table; the agent binary itself is a Go
> program that connects back — decide whether to re-implement the agent in TS/Bun or keep
> the Go agent and just rebuild the server side.

### Server side (web)
- `GET /api/agent/ws?hostname=` — upgrade to WS; register the agent connection by
  hostname.
- Receive `AgentMessage {type:"output"|"exit", payload, commandID, exitCode}` and route
  to the active command channel (Part 9 agent path).
- `POST /api/status` — agent heartbeat: upsert `server_agents` with cpu/mem/net/ip/
  version/last_seen.
- `POST /api/agent/request-update/{id}` + `/request-update-all` + `/request-restart/{id}`
  — set flags returned in the next heartbeat response (`{command:"update"|"restart"}`).
- `GET /api/agent/install` — serve an install shell script (detect arch, download binary,
  install systemd service).
- `GET /api/agent/download?arch=` — serve the agent binary for amd64/arm64/arm.
- `GET /api/agents/options` — list hostnames (for the global agent modal).

### Agent binary (optional reimplementation)
Connects to server, opens WS, heartbeats every 5s, executes `exec` commands, streams
output, handles `update`/`restart`. If re-implementing in TS, build a standalone Bun
script + systemd unit.

**Acceptance (server side):** agents register, heartbeats update the table, run-on-agent
macros stream output, update/restart requests are honored.

---

## Part 12 — File-tree scanner worker

**Source:** `scanner.go`. **Type:** run-once worker (`src/workers/file-scanner.ts`) +
systemd timer.

### Behavior
- Walk `/mnt/debrid/media` (configurable).
- For each symlink, resolve its target; if target starts with `/mnt/addons/nzbdav` →
  upsert into `nzb_files`; if `/mnt/addons/debrid` → `debrid_files`.
- Store `path`, `name`, `parent_path`, `is_dir`, `link_target`, `file_count`,
  `updated_at`. Build parent/child relationships for the tree.
- The original also runs an `fsnotify` watcher with 500ms debounce for live updates. In
  Mission Control, prefer a periodic systemd timer (e.g. every few minutes) since
  workers are run-once. (A long-running watcher could be a separate worker if desired.)
- The NZB/Debrid delete handlers delete from disk + remove/refresh DB rows.

### Config
`scanRoot`, `nzbTargetPrefix`, `debridTargetPrefix` from config (defaults in
`scanner.go`).

**Acceptance:** after running, `/nzb` and `/debrid` show populated trees; deletes remove
files + rows.

---

## Part 13 — Scraper workers (the webscrapers)

**Source:** `scraper.go` (141jav + orchestration), `projectjav.go`, `pornrips.go`,
`pkg/torbox`, `pkg/decypharr`. **Type:** run-once workers in
`src/workers/scrapers/`, scheduled by systemd timer (original = every 3h).

> The user explicitly wants the webscrapers rewritten as **worker tasks in TypeScript**.

### Shared orchestration
- A `src/workers/scraper-runner.ts` that, per source, sets a scraping-status flag,
  cleans hidden results older than 20 days, runs the source scraper, inserts results,
  clears the flag. Mirror `runScrape` + `cleanupOldScrapeResults`.
- Status sharing across processes: since the web page polls `/api/scraper/status`, store
  `is_scraping` per source in the `settings` table (or a dedicated `scraper_status`
  table) so the web process can read it. Trigger endpoints set the flag + spawn the
  worker (or rely on the timer).

### Source: 141jav (`scrape-141jav.ts`)
- Fetch `https://www.141jav.com/tag/Big%20Tits`, up to 3 pages (`?page=N`).
- Parse listing with an HTML parser (e.g. `cheerio` — equivalent of `goquery`).
- Extract title, image, magnet, tags per item.
- For each magnet: `extractHashFromMagnet` → Torbox `checkCached`; **insert only cached
  items**. `unique_key = magnet + "|"`.
- Sanitize titles.

### Source: ProjectJAV (`scrape-projectjav.ts`)
- Fetch `https://projectjav.com/tag/big-tits-7/`, up to 3 pages.
- Parse `.video-item`: title, image, date, page URL, tags, and per-item files
  (magnet/fileSize/seeds/leechers).
- Torbox cache-check all file hashes; **insert the item with its largest cached file**;
  skip VR tags and JAV filters per original logic. `unique_key` per file.

### Source: PornRips (`scrape-pornrips.ts`)
- Fetch `https://pornrips.to/category/1080p/`, 1 page.
- Parse `article.type-post`: title, detail URL; then **scrape each detail page** for
  images + torrent/magnet links.
- Insert all items (no cache check); filter out Transfixed / `.TS` / Trans content.
- `image_url` stores comma-separated images. `unique_key = "|" + torrentURL`.

### Download flow (used by the page, lives in API/runner not worker)
- `POST /api/scraper/download {id}`: fetch the result's magnet/torrent, submit to
  Decypharr (`addMagnet`/`addTorrent`), mark `is_downloaded` + `is_hidden`.

### Lib deps
Cheerio (HTML parse), Torbox client (Part 2), Decypharr client (Part 2).

### Agent tasks
1. Port each source's parser to TS + cheerio, preserving selectors and filters exactly.
2. Port Torbox cache-check + hash extraction.
3. Build the runner with status flags + cleanup + DB inserts.
4. Add systemd timer unit (every 3h) + `just run-worker src/workers/scraper-runner.ts`.

**Acceptance:** running the worker populates `scrape_results`; the scraper page shows
cards; cache-check filtering matches original behavior; status polling works.

---

## Part 14 — Database viewer

**Routes:** `/database`, `/database/{table}` · **Source:** `database.templ`,
`database.go`.

### `/database`
- Grid of cards, one per table (list tables via
  `GET /api/database/tables`). Click → `/database/{table}`.

### `/database/{table}`
- Back link + table name + "(First 100 rows)".
- Table with one column per DB column; each header has a **per-column filter input**
  (debounced 500ms → `GET /api/database/{table}?col=val...`) that does a LIKE filter.
- Rows mono, truncated with title tooltip, alternating row bg.
- Empty state when no matches.

### Data/API
- `GET /api/database/tables`, `GET /api/database/{table}` (accepts filter query params,
  returns columns + first 100 rows as `string[][]`).

### Agent tasks
Build introspection via Prisma (`prisma._prismaClient`/raw SQL `PRAGMA table_info` +
`SELECT ... LIMIT 100`), the grid, the filterable table.

**Acceptance:** tables list; a table renders columns + first 100 rows; filters narrow
results.

---

## Part 15 — Config page

**Route:** `/admin/config` · **Source:** `config.templ`, `config.go`,
`response_types.go`.

### UI
- "Config" header + "Global application configuration" subtitle.
- Settings card with a **Real Debrid API Key** field (mono) + helper text.
- Save button → `PUT /api/config` (Server Action/API). Show "Config saved" toast/banner.
- The sidebar Real-Debrid badge reads from this key via `/api/real-debrid/status`
  (calls Real-Debrid `getUser`, shows premium days remaining / "Invalid key" / "Offline"
  / "Not configured").

### Data/API
- `GET /api/config`, `PUT /api/config` (only allow known keys — currently
  `real_debrid_api_key`).
- `GET /api/real-debrid/status` (returns a badge label + ok boolean).

### Agent tasks
Build form + save + the Real-Debrid status endpoint using the Part 2 client. Default
config map = `{ real_debrid_api_key: "" }`.

**Acceptance:** saving persists; badge reflects Real-Debrid premium status.

---

## Part 16 — Server Status page

**Route:** `/status` · **Source:** `server_status.templ`, `server_status.go`.
**Depends on:** Part 11 (agent system) — can stub with empty state first.

### UI
- Header "Server Status" + version + actions: **Update All** (requests all agents
  update), **Add Server** (opens modal with a `curl -sL <origin>/api/agent/install |
  bash` one-liner, click-to-copy).
- **Auto-refresh** the table every 5s (`GET /api/status` or `/status/table`).
- Desktop: full table — Hostname, IP, CPU (bar + %), Memory (bar + used/total GB), Net
  Up, Net Down, Version (with per-agent Update button if version ≠ server version), Last
  Seen (EST), Actions (Restart).
- Mobile: card layout per agent with the same metrics.
- Agents unseen > 1 min are dimmed (opacity 50%).
- Color thresholds: >80% → error red, >50% → amber, else green.
- Empty state "No agents connected."

### Data/API
- `GET /api/agents` (list), `POST /api/agent/request-update-all`,
  `POST /api/agent/request-update/{id}`, `POST /api/agent/request-restart/{id}`.

### Agent tasks
Build the table + mobile cards + refresh polling + update/restart actions + Add Server
modal. Human-readable size + EST time format helpers (`src/lib/format.ts`).

**Acceptance:** agents render with live metrics; update/restart requests send; Add
Server modal copies install command.

---

## Part 17 — Log Viewer

**Route:** `/logs` · **Source:** `logs.templ`, `logs.go`.

### UI
- Header "System Logs" + filter input + "Exclude Web" checkbox (default on, hides
  HTTP request lines like `GET /`, `POST /`, `"GET ` etc.).
- Service selector buttons: **Web**, **Magnet Bridge** (extensible).
- Refresh button + auto-refresh every 5s.
- Terminal panel rendering log lines (`whitespace-pre-wrap`), autoscroll unless user
  scrolled up.
- "Last updated" timestamp.

### Behavior
- `GET /api/logs?service={web|magnet_bridge}&lines={100|all}`.
- On first load fetch `lines=all`; on subsequent polls fetch `lines=100` and **append
  only new lines** (find overlap with last old line).
- Client-side filter by text + exclude-web.

### Implementation note
Logs come from systemd journal in production (the app runs as `mission-control.service`).
The `/api/logs` route can shell out to `journalctl -u mission-control.service -n {N}`
(and `-u magnet_bridge` for that service), or read a log file. Decide based on deploy.

**Acceptance:** logs stream and append; filter + exclude-web work; service switch works.

---

## Part 18 — One-off scripts (CMD directory + scripts/) → TypeScript

The user wants all one-off scripts in `~/ServerTool/cmd/` and `~/ServerTool/scripts/`
rewritten in TypeScript. Put runnable one-offs in `scripts/` (run via `just script
scripts/foo.ts`) and long-running/cron-style ones in `src/workers/` (run via
`just run-worker`). Webscrapers already covered in Part 13.

### 18.A Arr integration scripts (`scripts/arr/`)
Port from `cmd/`:
- **arr_searcher** → `scripts/arr/arr-searcher.ts`: trigger searches in priority order
  (Radarr→RadarrKids→Radarr4K, Sonarr→SonarrKids→Sonarr4K). Radarr: movies with
  `status=="released" && !hasFile && monitored`. Sonarr: `/api/v3/wanted/missing`
  paginated (50/page). Trigger `MoviesSearch`/`EpisodeSearch`. Flags: `--limit` (per
  type), `--dry-run`.
- **radarr_sync** → `radarr-sync.ts`: delete 4K Radarr movies not in main (by TMDB id),
  `deleteFiles=true`. `--dry-run`.
- **sonarr_sync** → `sonarr-sync.ts`: same for Sonarr4K vs Sonarr (TVDB id). `--dry-run`.
- **sonarr_season_searcher** → `sonarr-season-searcher.ts`: for fully-aired seasons with
  no downloaded episodes, trigger `SeasonSearch`.
- **sync_profiles** → `sync-profiles.ts`: interactive (prompt) sync of Tags, Quality
  Profiles, Delay Profiles between master/slave Sonarr/Radarr. Delay profiles require tag
  sync first.

### 18.B Media management scripts (`scripts/media/`)
Port from `cmd/`:
- **debrid_cleaner** → `debrid-cleaner.ts`: find rclone/debrid dirs not referenced by any
  media symlink → delete. `--dry-run`, `--media-path`, `--media-base-path`.
- **special_cleaner** → `special-cleaner.ts`: delete small files (<75 MB), empty dirs in
  "special" paths; worker pool. `--delete`, `--workers`.
- **broken_link_finder** → `broken-link-finder.ts`: find broken symlinks + corrupt media
  (via `ffprobe` 30s timeout) in special dirs; worker pool; write report file; `--rm`.
- **cinesync_cleanup** → `cinesync-cleanup.ts`: walk special/VR symlinks, remap paths,
  auth to CineSync, skip processing for already-symlinked files.

### 18.C Torrent / download scripts (`scripts/torrent/` or `src/workers/`)
- **magnet_bridge** → `src/workers/magnet-bridge.ts` (long-running) + optional API mode:
  poll Decypharr for `special`/`pausedUP` torrents, clean small symlinks, move to media
  lib (keep larger), remove from UI. `--api` mode serves `POST /api/{arr}/add` +
  userscript. (Decide if this stays a worker or a small API service.)
- **torrent_watch** → `src/workers/torrent-watch.ts`: watch dir for `.torrent`/`.magnet`,
  upload to Decypharr, delete; poll completed → move to media. `--watch-dir`, `--api`.
- **torrent_watcher** → `src/workers/torrent-watcher.ts`: lightweight forwarder to a
  Magnet Bridge API. `--watch-dir`, `--url`, `--arr`.

### 18.D Plex / Trakt scripts (`scripts/plex/`)
- **plex_comparer** → `plex-comparer.ts`: OAuth PIN flow, list servers, pick two
  libraries, compare file sets, report missing/duplicates. Persist token to
  `~/.servertool/plex_token` (or env). `--url`, `--token`, `--lib-a`, `--lib-b`.
- **plex_recent_requester** → `plex-recent-requester.ts`: Continue Watching + Watchlist
  RSS → Sonarr lookup/add (anime detection via SkyHook + TVMaze fallback), unmonitor
  prior episodes, `SeriesSearch`. Env: `PLEX_TOKEN`, `PLEX_URL`, `PLEX_WATCHLIST_RSS`.
- **plex_token_extractor** → `plex-token-extractor.ts`: standalone OAuth PIN flow →
  print `PLEX_TOKEN=`.
- **trakt_exporter** → `trakt-exporter.ts`: device-code flow, export watched shows as
  txt/CSV/JSON. `--csv`, `--json`, `--year`. Env: `TRAKT_CLIENT_ID/SECRET`.
- **plex_to_arr.py** → `scripts/plex/plex-to-arr.ts`: the Python script — syncs Plex CW +
  Watchlist to Sonarr/Radarr, auto-detect anime, add+search. `--dry-run`,
  `--clean-cache`.

### 18.E Utility scripts (`scripts/util/`)
- **command_runner** → `command-runner.ts`: SSH wrapper (fixed key/host, passthrough
  args). Use `ssh2` or shell out to `ssh`.
- **fix_141jav** → `scripts/util/fix-141jav.ts`: one-off DB migration setting
  `source='141jav'` on null-source scrape rows. (Likely already applied — keep as a
  reference migration script.)
- **icon_gen** → `scripts/util/icon-gen.ts`: generate PWA/favicon icons from a source
  PNG (auto-crop + resize to 192/180/32/16/ico). Use `sharp`.
- **realdebrid_migrate** → `scripts/util/realdebrid-migrate.ts`: consult
  `cmd/realdebrid_migrate/` for exact behavior (config/flags) and port accordingly.
- **github_release.py** → `scripts/util/github-release.ts`: poll GitHub for latest
  releases of tracked repos within a time window (arg: hours).
- **cleanup_orphans.py / .sh** → `scripts/media/cleanup-orphans.ts`: find/delete
  orphaned debrid files with no media symlink. `--run`.
- **clean_broken_links.sh / clean_special.sh / find_debrid_symlinks.sh /
  find_nzbdav_symlinks.sh** → `scripts/media/*.ts`: lightweight alternatives to the Go
  agents (broken links, <75MB symlinks, debrid/nzbdav symlink finders). All dry-run by
  default, `--delete`/`--run` to act.

### 18.F Justfile
Add per-script just recipes or keep the generic `just script scripts/foo.ts` and
`just run-worker src/workers/foo.ts`. Update `AGENTS.md` with every new script/worker.

### Agent tasks
Each script category (A–E) is independently assignable. Each port should: preserve flags &
dry-run defaults, reuse Part 2 lib clients, use Bun-native APIs (`Bun.spawn`, `Bun.$`),
and include a short header docstring with usage.

**Acceptance:** each script runs via `just script` / `just run-worker` and matches the
original behavior (dry-run output identical where feasible).

---

## Cross-cutting notes

- **Naming:** rename "ServerTool" → "Mission Control" in the UI/brand, but keep internal
  table/field names identical for an easy data migration from the existing `config.db`.
- **Migration:** consider a one-time script to copy the existing SQLite `config.db` into
  the Prisma-managed DB (schemas match).
- **PWA:** the original ships a service worker (`sw.js`) + manifest + icons. Optional to
  carry over; if so, port `static/sw.js`, `site.webmanifest`, and regenerate icons via
  the icon-gen script.
- **CORS / API surface:** the original already exposes a clean JSON API
  (`handler/api.go`) intended for a Next.js frontend — use those response shapes
  verbatim (Part 0.C). The Next.js version replaces both the templ UI and the Go API with
  App Router pages + route handlers, but the JSON contracts stay the same.
- **External services** (keep addresses configurable): Decypharr `192.168.1.99:8282`,
  Torbox `api.torbox.app`, CineSync `192.168.1.102:5173`/`:8082`, Plex, Trakt, TVMaze,
  141jav, ProjectJAV, PornRips, PixHost.

---

## Recommended build order for a single coordinator

1. **Part 0 + Part 1 + Part 2** (foundation) — one agent each, in parallel.
2. **Part 9 + Part 10** (engines) — once Part 2 lands.
3. **Parts 3, 4, 5, 6, 14, 15, 17** (pages with no heavy worker deps) — parallel.
4. **Parts 7, 8** (depend on workers 12, 13) — parallel after workers start.
5. **Parts 12, 13** (workers) — parallel with the page work.
6. **Part 16 + Part 11** (agent system) — last.
7. **Part 18** (scripts) — any time after Part 2; chunk by category.

Each part ends with: working route(s), passing `just typecheck`, updated `AGENTS.md` if
new dirs/commands/patterns were introduced.
