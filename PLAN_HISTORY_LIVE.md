# Plan: Incremental Output Persistence in `runMacro`

## Context

The previous plan made `/history` and `/history/[id]` *refresh* the UI, but the data underneath never moved during a run:

- `src/lib/runner.ts` creates the `History` row with `output: ""` at the start, buffers every `write()` call into an in-memory `chunks` array, and only calls `updateHistory()` at the very end (success, failure, or error).
- The SSE stream publishes the same chunks, which is why the home page (`src/app/page.tsx`) and the in-app `MacroLogPanel` (on `/admin`) feel "live" — they subscribe to the bus directly. But those are clients, not the database.
- `/history/[id]` polls `GET /api/history/:id` and the API reads from the DB, so as far as the history tab is concerned, the row is **empty for the entire run** and then materializes all at once when `updateHistory()` is called.

**User-visible result** (their exact scenario): a macro that runs `echo hi` then `sleep 10` — the history tab shows "No output recorded." the entire 10 seconds, then suddenly snaps to the full transcript the moment the macro finishes. The home page, by contrast, streams the same content line-by-line the whole time.

The history tab is "supposed to be pulling from the database", as the user put it. The database is the source of truth for `/history`, and the source of truth isn't being written to.

## Approach

Make `runMacro` flush its in-memory `chunks` buffer to the DB on a short interval while the macro is running. The UI (polling + the existing SSE) already picks up the new data; this just gives the DB something to return.

The SSE stream remains in place for the home page and the admin `MacroLogPanel` — those are the "live terminal" surfaces. The history pages become purely **database-driven** (no SSE dependency for content), which is a cleaner mental model and matches the user's expectation.

### Key decisions

- **Flush cadence:** every 1.5 s while there is pending output. Cheap, low enough latency that even short macros (a few seconds) will have ≥ 1 flush before completion, long enough that we don't hammer the DB with hundreds of writes.
- **Dirty flag** so the interval short-circuits when no `write()` has happened since the last flush. Idle runs cost 0 writes.
- **Atomic per-row update.** `db.history.update({ where: { id }, data: { output } })` is a single SQL UPDATE on a single row, so SQLite serialises it for us. The worst case is two flushes racing — the later one wins, which is correct.
- **The existing final `updateHistory()` call stays** as the authoritative last write. It runs after the interval is cleared, so it always lands the final state.
- **DB flush is fire-and-forget-ish** but with error logging — a transient DB failure must not crash the macro or corrupt the chunks buffer. The dirty flag stays set on failure so the next interval retries.
- **History detail page poll cadence** drops from 5 s → 2 s while `status === "running"` (back to 5 s once finalised). With a 1.5 s flush + 2 s poll, the user sees new output within ~3.5 s worst case — close to the home-page feel without 5 s gaps.
- **History detail page terminal content** switches to **DB-driven** (drop the SSE-while-running branch). This avoids the SSE-replay-vs-DB-overlap problem and matches the user's mental model of "history = database".
- **No SSE filtering needed on the detail page** for content (status indicator only, or just remove the SSE connection entirely from this page).

## Files to modify

- `src/lib/runner.ts` — add the flush interval, mark dirty in `write()`, clear the interval in every exit path, and make the final `updateHistory()` calls idempotent w.r.t. the interval.
- `src/app/history/[id]/page.tsx` — drop SSE for content, switch terminal source to `item.output`, drop poll interval to 2 s while running, drop the LIVE/RECONNECTING/SAVED indicator (no longer relevant).
- `AGENTS.md` — add a note about the incremental-flush pattern under "Phase 6" or a new "Phase 8 — Incremental history output" section.

## Steps

### 1. Runner — incremental DB flush

- [ ] Add a module-level `setInterval` (or one per `runMacro` call) that fires every 1500 ms and:
  1. If `!dirty`, return.
  2. Snapshot `chunks.join("")` into a local `output` string.
  3. Try `db.history.update({ where: { id: history.id }, data: { output } })`.
  4. On success, set `dirty = false`. On failure, `console.error` and leave `dirty = true` (next interval retries).
- [ ] Track `dirty` as a closure-local boolean in `runMacro` (per-run, not module-level).
- [ ] Set `dirty = true` inside the existing `write()` function — one line, no API change.
- [ ] Clear the interval in **every** exit path in `runMacro`: success, failed (agent, local, dispatch, spawn), and the catch-all at the bottom. The cleanest pattern is `try { ... } finally { clearInterval(flushInterval); }` around the whole body, but the existing code has multiple early returns, so an explicit `clearInterval` before each `updateHistory` is safer than restructuring.
- [ ] Verify the local-execution and agent-execution paths both go through the same `write()` so a single dirty-flag flip covers both.
- [ ] Verify the final `updateHistory()` calls (in every exit path) still set `endTime` and `status` correctly — they should not regress.

### 2. History detail page — DB-driven, no SSE for content

- [ ] Remove the `useLiveStream` import and call from `src/app/history/[id]/page.tsx`.
- [ ] Change the poll interval: 2 s while `itemRef.current?.status === "running"`, 5 s otherwise. Implementation: keep the existing 5 s interval, but inside the callback skip the tick when the page is hidden (already done) **and** schedule an extra `fetchItem` via a faster 2 s interval that's only mounted while running. Cleanest: a single `setInterval` whose period reads from a `pollMs` state that switches between 2000 and 5000 based on `itemRef.current?.status`.
- [ ] Simplify the terminal content: `const terminalText = item?.output ?? ""`. No more stream-vs-saved branching.
- [ ] Remove the LIVE / RECONNECTING / SAVED indicator. (The pulsing dot in the layout is still fine; only the per-detail-page indicator goes away.)
- [ ] Remove the now-unused `terminalRef`, `userScrolledRef`, and the two scroll-handling `useEffect`s. (Auto-scroll within a 2 s polling cadence is unnecessary — the page won't move fast enough to need it.)
- [ ] Keep the `Refresh` button and `lastUpdated` label.

### 3. Update `AGENTS.md`

- [ ] Add a section under "Phase 7 — Scripts Migration" → new "Phase 8 — Incremental history output":
  - `runMacro` flushes the in-memory `chunks` buffer to `history.output` every 1.5 s while running.
  - The final `updateHistory` call is the authoritative last write; the interval is cleared in every exit path.
  - History pages are purely DB-driven; SSE is reserved for the home page and the admin `MacroLogPanel`.

### 4. Verify

- [ ] `just typecheck` passes.
- [ ] `just lint` — no new errors beyond the pre-existing pattern in `macro-log-panel.tsx:103` and `history/page.tsx:78`. The detail page loses the `useLiveStream` import so its "synchronous setState in effect" lint from the previous plan goes away.
- [ ] **End-to-end smoke:** start the dev server, trigger the existing `Longrunning` macro (echo + sleep 10), and within ~2 s of the macro starting, `GET /api/history/<id>` returns a non-empty `output` containing `=== Running Macro: ...`, `> echo Going to be a long one`, `Going to be a long one`, and `> sleep 10`.
- [ ] After completion, the final `output` matches what was streamed (no truncation, no duplication).
- [ ] Trigger a fast macro (< 1 s of execution) — the row is still recorded correctly even if the interval never fires (the final `updateHistory` covers it).
- [ ] Trigger a long macro and then kill the dev server mid-run. The `output` column reflects whatever the last successful flush wrote; the row is left in `status: "running"` and a future cleaner can finalise it. (This is the existing behaviour; we're not making it worse.)

## Out of scope

- **SSE filtering by `macroId`.** The home page and admin panel still receive every macro's output. Fixing that is a separate concern.
- **Cancelling / interrupting a running macro from the UI.** Not what the user asked for.
- **Moving the flush out of the runner process.** The runner and the Next.js dev server share the same `db` (libsql file), so cross-process isn't an issue locally; in production they're the same Node process. If we ever split them, the flush stays in the runner.
