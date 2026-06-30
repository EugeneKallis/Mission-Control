# Testing Gap Coverage Plan

## Gap Inventory

### Already tested (35 files)
| Area | Count | Examples |
|------|-------|---------|
| `src/lib/*` (pure logic) | 14 | agents/event-stream, agents/registry, arr-map, clients/* (6), config, cron-scheduler, cron, format, live-bus, migrate, runner, db/queries |
| `src/workers/scrapers/*` (parsers) | 5 | 141jav, pornrips, projectjav, shared, status |
| `src/workers/*.ts` (pure helpers) | 3 | file-scanner, magnet-bridge, scraper-runner (parseTargets) |
| `scripts/_lib/*` | 4 | cli, collections, format, log |
| `scripts/arr/*` | 4 | arr-searcher, radarr-sync, sonarr-sync, sonarr-season-searcher |
| `scripts/plex/*` | 1 | plex-to-arr |
| `scripts/util/*` | 1 | github-release |

### Untested gaps

| Area | Files | Value | Difficulty |
|------|-------|-------|------------|
| **Components** | 24 `.tsx`/`.ts` | ⭐⭐⭐ High | Medium (needs RTL setup) |
| **API routes** | ~50 `route.ts` | ⭐⭐⭐ High | Low (thin wrappers, mostly validation + status) |
| **Hooks** | 1 (`use-live-stream.ts`) | ⭐⭐ Medium | Medium (needs jsdom) |
| **Worker main loops** | 3 (`agent.ts`, `scraper-worker.ts`, `torrent-watch.ts`) | ⭐ Low (integration) | Hard |
| **Scripts** | 8 (media/*, util/command-runner, util/fix-141jav, util/icon-gen, arr/sync-profiles, plex/plex-token-extractor, plex/trakt-exporter) | ⭐ Low-Med | Med-Hard (I/O + OAuth) |
| **App pages** | 15 `page.tsx` | ⭐ Low (Next.js pages) | High |

---

## Parallelization Strategy

**Two-phase approach:** a single-agent prerequisite (Phase 0) sets up shared infra. Then 6–10 subagents fan out in parallel, each owning a **disjoint set of files**. No agent touches another agent's test files or shared configs — zero merge risk.

### Phase 0 — Prerequisite (1 agent, sequential, ~30 min)

Must complete before parallel fan-out.

#### 0.1 Install testing dependencies
```bash
bun add -d @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom
```
- `happy-dom` — fast, Bun-native DOM. Lightweight replacement for jsdom.
- `@testing-library/react` — render components, query by role/text.
- `@testing-library/jest-dom` — `.toBeInTheDocument()`, etc. (matchers for bun expect)
- `@testing-library/user-event` — simulate clicks/keyboard.

#### 0.2 Configure bun test environment
Add `bunfig.toml` (or update if exists):
```toml
[test]
preload = "./src/test-utils/preload.ts"
```

Create `src/test-utils/preload.ts`:
```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

This gives all `.tsx` test files a browser DOM (`document`, `window`, `HTMLElement`, etc.) without importing it in every file.

#### 0.3 Create React render utility
Create `src/test-utils/render.tsx`:
```tsx
import React from "react";
import { render as rtlRender, RenderOptions } from "@testing-library/react";

// Extend as needed (e.g. wrap with providers, mock router)
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function render(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: AllTheProviders, ...options });
}

export * from "@testing-library/react";
```

#### 0.4 Create API route test harness
Create `src/test-utils/route-helpers.ts`:
```ts
import { NextRequest } from "next/server";

/**
 * Build a NextRequest for POST/PUT with a JSON body.
 */
export function jsonRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    duplex: "half",
  });
}

/**
 * Build a NextRequest for GET.
 */
export function getRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

/**
 * Parse a NextResponse body as JSON.
 */
export async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}
```

#### 0.5 Verify Phase 0
```bash
just typecheck         # tsconfig.test.json already has **/*.test.tsx
just test              # all existing tests still pass
```

---

### Phase 1 — Parallel: Component Tests (7 subagents)

All subagents can run in parallel — they own disjoint files. Each creates co-located `.test.tsx` files. Numbered for reference but start simultaneously.

**Shared conventions for all component subagents:**
- Import `render, screen` from `@/test-utils/render` (not `@testing-library/react` directly).
- Use `@testing-library/jest-dom/vitest` matchers: `import "@testing-library/jest-dom/vitest"`.
- Test file convention: `*.test.tsx` next to the source.
- Each test file is a self-contained `bun:test` file (`describe`/`test`/`expect`).
- Mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) when needed.
- Mock `@/lib/db` with `mock.module` if the component imports queries directly (most feature components do not — they call API routes via `fetch`).
- Components that `fetch` from API routes: mock `globalThis.fetch` (restore in `afterEach`).
- If a component uses `useSearchParams()` / `useRouter()` without a provider, mock the module.

#### C-1: UI primitives — static/presentational
**Agent owns:** `src/components/ui/` (all 8 files)
- `button.tsx`, `input.tsx`, `modal.tsx`, `confirm-dialog.tsx`, `empty-state.tsx`, `status-pill.tsx`, `toggle-switch.tsx`, `terminal.tsx`
- **Scope:** props → DOM. Ex: toggle-switch fires `onToggle`, button fires `onClick`, modal has `open` prop.
- **12–18 tests expected.**

#### C-2: Layout shell (left sidebar)
**Agent owns:**
- `src/components/layout/nav-item.tsx`
- `src/components/layout/sidebar-content.tsx`
- `src/components/layout/mobile-header.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/toast-provider.tsx`
- **Scope:** nav-item highlights, mobile-header collapse, sidebar renders nav items, app-shell wraps children, toast-provider state.
- **10–15 tests expected.**

#### C-3: Feature panels (overlays + browse)
**Agent owns:**
- `src/components/agent-modal.tsx`
- `src/components/macro-log-panel.tsx`
- `src/components/browse-scripts.tsx`
- `src/components/file-tree-viewer.tsx`
- **Scope:** agent modal form + submit, macro-log-panel renders terminal, browse-scripts list, file-tree expands/collapses.
- **12–18 tests expected.**

#### C-4: Schedules components
**Agent owns:**
- `src/components/schedules/schedules-list.tsx`
- `src/components/schedules/new-schedule-form.tsx`
- `src/components/schedules/edit-schedule-form.tsx`
- **Scope:** list renders rows + toggle + delete, new form validates + builds cron, edit form prefills from cron expression.
- **12–16 tests expected.**

#### C-5: Scraper components
**Agent owns:**
- `src/components/scraper/access-gate.tsx`
- `src/components/scraper/scraper-card.tsx`
- `src/components/scraper/scraper-page.tsx`
- `src/components/scraper/scraper-types.ts` — types only, no test needed.
- **Scope:** access-gate modal + inactivity lock, scraper-card renders result + keyboard nav, scraper-page tabs + toolbar.
- **14–20 tests expected.**

#### C-6: Migrate + Hooks
**Agent owns:**
- `src/components/migrate/migrate-page.tsx`
- `src/hooks/use-live-stream.ts`
- **Scope:** migrate-page path input + debounce + preview + confirm, use-live-stream EventSource wrapper.
- **8–12 tests expected.**
- **Hook note:** `use-live-stream` needs `EventSource` mock (happy-dom provides a basic one, may need manual mock).

#### C-7: App page smoke tests (optional, low priority)
**Agent owns:** `src/app/page.tsx` through `src/app/*/page.tsx` (15 files)
- **Scope:** each page mounts without throwing.
- **Low value** — pages are Next.js App Router components with server components that RTL can't render natively. Only include if there's a clear "does this page crash" smoke test. Skip if complex.
- **0–15 smoke tests expected.**

### Phase 2 — Parallel: API Route Tests (6 subagents)

All can run in parallel with each other AND with Phase 1 (disjoint files). Each test file mocks `@/lib/db` and imports `GET`/`POST`/`PUT`/`DELETE` from the route file directly. Use the test harness from Phase 0 for `NextRequest` construction.

**Shared conventions for all API route subagents:**
- Import `jsonRequest`, `getRequest`, `jsonBody` from `@/test-utils/route-helpers`.
- Mock `@/lib/db` with `mock.module` and test-only Prisma client (`makeTestDB` from `@/lib/db/test-helpers`). Each route handler imports from `@/lib/db/queries` which imports `@/lib/db` — on test, inject the test DB.
- If a route also calls a module that uses fetch (e.g. `decypharr` client), mock that module.
- Test: successful requests (status + JSON shape), validation failures (400 + error.details), internal errors (500), edge cases (missing fields, bad JSON).
- Each route file gets its own `*.test.ts` next to the route (e.g. `src/app/api/schedules/route.test.ts`).
- Re-import the route module after mocking the DB (`import(`/path/to/route.ts?bust=${Date.now()}`)` to dodge module cache), same pattern as existing queries tests.

#### A-1: Schedules (3 routes, 5 handlers)
**Agent owns:**
- `src/app/api/schedules/route.ts` (GET + POST)
- `src/app/api/schedules/[id]/route.ts` (GET + PUT + DELETE)
- `src/app/api/schedules/[id]/toggle/route.ts` (POST)
- **~12–16 tests expected.**

#### A-2: Macros (7 routes)
**Agent owns:**
- `src/app/api/macros/route.ts` (GET + POST)
- `src/app/api/macros/[id]/route.ts` (GET + PUT + DELETE)
- `src/app/api/macros/[id]/commands/route.ts` (GET + POST)
- `src/app/api/macros/[id]/commands/reorder/route.ts` (POST)
- `src/app/api/macros/reorder/route.ts` (POST)
- `src/app/api/macros/groups/route.ts` (GET + POST)
- `src/app/api/macros/groups/[id]/route.ts` (PUT + DELETE)
- **~20–28 tests expected.**

#### A-3: Scraper (10 routes)
**Agent owns:**
- `src/app/api/scraper/results/route.ts`
- `src/app/api/scraper/status/route.ts`
- `src/app/api/scraper/status-all/route.ts`
- `src/app/api/scraper/trigger/route.ts`
- `src/app/api/scraper/trigger-all/route.ts`
- `src/app/api/scraper/hide/route.ts`
- `src/app/api/scraper/undo/route.ts`
- `src/app/api/scraper/download/route.ts`
- `src/app/api/scraper/hide-all/route.ts`
- `src/app/api/scraper/refresh/route.ts`
- **~18–24 tests expected.**

#### A-4: Agent (11 routes)
**Agent owns:**
- `src/app/api/agent/events/route.ts`
- `src/app/api/agent/heartbeat/route.ts`
- `src/app/api/agent/result/route.ts`
- `src/app/api/agent/install/route.ts`
- `src/app/api/agent/download/route.ts`
- `src/app/api/agent/source/route.ts`
- `src/app/api/agent/request-restart/[id]/route.ts`
- `src/app/api/agent/request-update/[id]/route.ts`
- `src/app/api/agent/request-update-all/route.ts`
- `src/app/api/agents/route.ts`
- `src/app/api/agents/options/route.ts`
- **~18–24 tests expected.**
- **Note:** `agent/events` is an SSE endpoint — test the body/status without trying to stream.

#### A-5: Debrid + NZB + Arr (8 routes)
**Agent owns:**
- `src/app/api/debrid/delete/route.ts`
- `src/app/api/debrid/search/route.ts`
- `src/app/api/debrid/tree/route.ts`
- `src/app/api/nzb/delete/route.ts`
- `src/app/api/nzb/search/route.ts`
- `src/app/api/nzb/tree/route.ts`
- `src/app/api/real-debrid/status/route.ts`
- `src/app/api/arr/instance-map/route.ts`
- **~14–18 tests expected.**

#### A-6: Everything else (12 routes)
**Agent owns:**
- `src/app/api/history/route.ts` + `src/app/api/history/[id]/route.ts`
- `src/app/api/config/route.ts`
- `src/app/api/database/[table]/route.ts` + `src/app/api/database/tables/route.ts`
- `src/app/api/logs/route.ts`
- `src/app/api/hello/route.ts`
- `src/app/api/scripts/route.ts`
- `src/app/api/run/[id]/route.ts`
- `src/app/api/migrate/preview/route.ts` + `src/app/api/migrate/run/route.ts`
- `src/app/api/ws/route.ts` (SSE — lightweight test only)
- **~16–22 tests expected.**

---

### Phase 3 — Optional: Scripts + Workers (3 subagents)

Can run in parallel with Phases 1 and 2. Lower value — the already-covered queries module validates most business logic. Only include if scripts have pure functions worth extracting.

#### S-1: Media scripts
**Agent owns:**
- `scripts/media/broken-link-finder.ts` — extract pure helpers first (symlink resolver, ffprobe caller wrapper), then test.
- `scripts/media/debrid-cleaner.ts` — extract resolvePath / symlink walk, test.
- `scripts/media/special-cleaner.ts` — extract size filtering, test.
- **6–10 tests expected.**

#### S-2: Utility scripts
**Agent owns:**
- `scripts/util/command-runner.ts` — extract the SSH argument builder, test.
- `scripts/util/fix-141jav.ts` — no-op with current schema (skip, or 1 docstring test).
- `scripts/util/icon-gen.ts` — skip (requires sharp + image I/O).
- **3–5 tests expected.**

#### S-3: Worker main loops (optional)
**Agent owns:**
- `src/workers/agent.ts` — extract websocket message parser, test the pure parts.
- `src/workers/scraper-worker.ts` — verify runAllSources calls each scraper.
- `src/workers/torrent-watch.ts` — extract file walker / filter, test.
- **Low priority.** Main loops are integration scripts. Only test the pure helpers extracted.
- **4–8 tests expected.**

---

## Execution Order

```
Phase 0 (single agent, blocks everything)
│
├─► Phase 1  C-1 ─┐
│   C-2 ─┤
│   C-3 ─┤
│   C-4 ─┤  all parallel
│   C-5 ─┤
│   C-6 ─┤
│   C-7 ─┘
│
├─► Phase 2  A-1 ─┐
│   A-2 ─┤
│   A-3 ─┤  all parallel
│   A-4 ─┤
│   A-5 ─┤
│   A-6 ─┘
│
└─► Phase 3  S-1 ─┐
    S-2 ─┤  all parallel (low priority)
    S-3 ─┘
```

## Verification

After all agents finish:
```bash
just typecheck     # unchanged — tsconfig.test.json already covers .tsx
just test          # all new tests pass
just test-coverage # optional: check coverage delta
```

## Key Patterns (from AGENTS.md — remind every subagent)

1. **bun:test** — `describe`/`test`/`expect`/`mock` from `bun:test`.
2. **Co-located tests** — `*.test.ts` or `*.test.tsx` next to source.
3. **`import.meta.main` guard** — scripts only (for any new pure-helper extraction).
4. **`mock.module("@/lib/db", ...)`** — process-global. Tests mocking the same module should be in their own files.
5. **`makeTestDB()`** from `@/lib/db/test-helpers` — creates temp SQLite with full schema. Returns `{ client, cleanup() }`.
6. **Re-import after mock** — `import(`path?bust=${Date.now()}`)` to bypass module cache when mocking `@/lib/db`.
7. **Fetch mocking** — save `globalThis.fetch` in module-level const, restore in `afterEach`.
8. **Dry run guard** — scripts have `if (import.meta.main) { main().catch(...) }`. Export `main(argv?)` for tests.
