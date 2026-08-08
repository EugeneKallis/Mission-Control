# Bug and Issue Audit Plan

This is a point-in-time audit of the current repository. The initial audit changed no production code; resolution status is recorded on each completed item.

## Baseline

Commands run after `bun install`:

| Check | Result |
| --- | --- |
| `just typecheck` | Pass |
| `just build` | Pass, with two whole-project NFT tracing warnings |
| `just test` | Fail: 1,726 pass, 3 fail |
| `just lint` | Fail before linting because Next 16 no longer supports `next lint` |
| `bun run lint` | Fail: 154 errors and 127 warnings; production code accounts for 50 errors and 46 warnings |
| `bun audit` | 42 advisories: 21 high, 20 moderate, 1 low |

The three failing tests are:

1. `SlashAutocomplete keyboard navigation > ArrowUp wraps to last item from first`
2. `SidebarContent — static nav items > keeps Archive collapsed by default and toggles its viewers`
3. `fetchHtml > sets a User-Agent header`

The slash-autocomplete test is flaky rather than consistently red: five isolated runs produced one pass and four failures, including both ArrowUp and ArrowDown failures.

## Working rules

Handle one numbered item per branch/PR. Do not combine adjacent findings just because they touch the same file.

For each item:

1. Add or isolate a deterministic reproduction that fails for the reported behavior.
2. Confirm the root cause and the intended behavior.
3. Make the smallest root-cause change.
4. Run the focused test, `just typecheck`, `just test`, and the real ESLint command.
5. Update this document with the result, then start the next item.

## Ordered queue

### 1. MC-BUG-001 — Arbitrary recursive filesystem deletion

- **Status:** ✅ Fixed
- **Result:** Both routes now require every selected path to exist in the relevant index, resolve indexed paths beneath `MEDIA_BASE_PATH`, reject lexical and parent-symlink escapes before any deletion, and remove the indexed media path rather than a path relative to `process.cwd()`.
- **Verification:** 20 focused route tests pass, including outside-root, non-indexed, escaping-parent-symlink, and valid indexed symlink cases. `just typecheck` and focused ESLint pass. Full `just test` remains at the audit baseline of three unrelated failures (1,732 pass, 3 fail), and full ESLint remains at the baseline 154 errors/127 warnings with no diagnostics in changed files.
- **Severity:** Critical
- **Confidence:** Confirmed by code inspection
- **Evidence:** `src/app/api/nzb/delete/route.ts:38` and `src/app/api/debrid/delete/route.ts:38`
- **Problem:** Both endpoints accept paths from the request body, add each supplied path directly to `allPaths`, and call `rm(path, { recursive: true, force: true })`. They do not require the path to exist in the indexed table and do not constrain it to the configured NZB/Debrid root. The service runs as root in the documented deployment.
- **Impact:** A malformed or hostile request can delete files or directories anywhere writable by the service account.
- **Isolated plan:** Add route-level tests for outside-root, non-indexed, symlink, and valid in-root paths; canonicalize paths; require containment under the configured root and membership in the relevant index before deletion.
- **Done when:** Outside-root and non-indexed paths return 400/403 without touching disk; valid indexed paths still delete correctly.

### 2. MC-BUG-002 — No server-side access control around privileged operations

- **Severity:** Critical when the service is reachable by untrusted LAN or internet clients
- **Confidence:** Confirmed architecture; deployment exposure is confirmed
- **Evidence:** `deploy/mission-control.service:13` binds to `0.0.0.0`; no middleware/auth guard exists. The scraper's “Authorized Personnel” gate is client-only session state in `src/components/scraper/access-gate.tsx`.
- **Problem:** Any network client that can reach the app can call command execution, task scheduling, configuration, database, file deletion, migration, and Pi-agent APIs. The visual scraper gate does not protect its APIs.
- **Impact:** Remote command execution, destructive actions, secret disclosure, and access to Pi conversations are possible from any reachable client.
- **Isolated plan:** First decide and document the trust model. If access is not guaranteed by an external authenticated reverse proxy, add one server-side authentication boundary covering pages, API routes, and SSE connections. Keep health/static routes explicitly allowlisted if needed.
- **Done when:** An unauthenticated request cannot read secrets, subscribe to streams, execute commands, or mutate state; authenticated UI flows remain functional.

### 3. MC-BUG-003 — Proxmox tokens are returned unmasked

- **Severity:** High
- **Confidence:** Confirmed; behavior contradicts route comments and project documentation
- **Evidence:** `src/app/api/pve/endpoints/[id]/route.ts:40` returns the complete endpoint row. POST in `src/app/api/pve/endpoints/route.ts:61` and PUT also return complete rows. Only the list GET masks tokens.
- **Problem:** Single-endpoint GET and write responses expose the full API token. The generic database viewer can also read `proxmox_endpoints`, and `/api/config` returns stored API keys in full.
- **Impact:** Browser clients, logs, extensions, or any network caller can recover infrastructure and media-service credentials.
- **Isolated plan:** Introduce one response serializer for Proxmox endpoints and use it in list/get/create/update responses. Separately decide whether the generic DB/config views should mask secret-bearing fields or be restricted to a stronger admin boundary.
- **Done when:** No endpoint response or generic table view exposes complete tokens, while blank-token updates still preserve the stored token.

### 4. MC-BUG-004 — Vulnerable direct runtime dependencies

- **Severity:** High
- **Confidence:** Confirmed by `bun audit`
- **Evidence:** `package.json` pins Next `16.2.9`; the audit reports Next `<16.2.11` affected by multiple high/moderate advisories, including SSRF, middleware bypass, and denial of service. The audit also reports vulnerable `sharp` through Next and `undici` through Cheerio.
- **Problem:** The production dependency graph contains known vulnerabilities. Other findings are in Prisma/ESLint development transitive dependencies.
- **Isolated plan:** Update the direct runtime packages first, one compatible dependency family at a time, beginning with Next/React-compatible releases. Re-run build, tests, and audit after each update; then handle remaining production transitives separately from tooling-only advisories.
- **Done when:** No known high-severity production advisory remains, and the full build/test checks pass.

### 5. MC-BUG-005 — Pi session deletion accepts dot path segments

- **Severity:** High
- **Confidence:** Confirmed validation defect; route-level exploitability through URL normalization should be reproduced first
- **Evidence:** `src/app/api/pi/sessions/[id]/route.ts:23`
- **Problem:** `basename(id) === id` rejects slash traversal but accepts `.` and `..`. Joining those values to the sessions directory resolves to the sessions root or its parent before recursive deletion.
- **Impact:** A crafted session ID may delete all Pi sessions or a broader Pi agent directory.
- **Isolated plan:** Add route-level tests for literal and encoded dot segments, empty/hidden names, and normal IDs. Reject `.`/`..` explicitly and verify the resolved target remains a direct child of the sessions directory.
- **Done when:** No accepted ID can resolve to the root, parent, or a nested path; a normal session directory is still removable.

### 6. MC-BUG-006 — Renaming or deleting a macro group hides its macros

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** `src/lib/db/queries.ts:119-125`; the admin confirmation says deleted-group macros “will remain as ungrouped” at `src/app/admin/page.tsx:1120`, but no reassignment occurs.
- **Problem:** `Macro.groupName` is a plain string rather than a relation. Renaming a `MacroGroup` does not update matching macros. Deleting a group does not move its macros to `Ungrouped`. `getGroupedMacros()` only returns macros whose `groupName` matches an existing group, so affected macros disappear from the UI.
- **Impact:** Existing macros become inaccessible through normal navigation after a group rename/delete.
- **Isolated plan:** Add DB-level tests for rename and delete with populated groups. Perform group mutation and macro reassignment in one transaction.
- **Done when:** Rename preserves group membership, delete moves macros to `Ungrouped`, and no macro disappears.

### 7. MC-BUG-007 — Scheduler APIs persist invalid state before registration succeeds

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** Worker timer POST writes at `src/app/api/schedules/timers/route.ts:45` before `CronJob` construction. Worker timer PUT/toggle, schedule POST/PUT, and agent-task PUT/toggle have the same DB-first pattern. Agent-task PUT does not call `validateCronExpression`; schedule and worker-timer routes do not consistently validate cron expressions either.
- **Problem:** Invalid cron input can be saved as enabled, after which scheduler registration throws. Update paths may remove the old live job after the DB has already been changed. Several catch blocks misreport scheduler errors as 404 “not found.”
- **Impact:** The API can return an error while leaving an enabled but unscheduled row, or can stop a previously valid job and persist invalid configuration.
- **Isolated plan:** Add route tests asserting no DB/scheduler drift on invalid cron or scheduler failure. Validate with the actual cron parser before mutation, and define a rollback/order strategy for scheduler synchronization.
- **Done when:** Invalid cron always returns 400 without mutation, scheduler failures do not leave DB/runtime state divergent, and error statuses are accurate.

### 8. MC-BUG-008 — Agent-task JSON events are parsed per chunk instead of per line

- **Severity:** High
- **Confidence:** Confirmed stream-framing bug
- **Evidence:** `src/lib/agent-task-scheduler.ts:203-220`
- **Problem:** Each stdout `data` chunk is immediately split on `\n`. Node does not guarantee that a chunk ends at a line boundary. Partial JSON is stored as plain text, and the remainder is independently parsed or stored, corrupting transcripts and dropping structured event rendering. The interactive Pi process manager already has the correct remainder-buffer pattern.
- **Impact:** Scheduled-task transcripts can be malformed or lose structured output depending on process chunking.
- **Isolated plan:** Add a deterministic child-process test that emits one JSON event over multiple chunks and multiple events in one chunk. Reuse the existing line-buffer approach from `process-manager.ts` rather than adding a new abstraction.
- **Done when:** Chunk boundaries do not affect rendered transcript output, including the final unterminated line.

### 9. MC-BUG-009 — SIGKILL escalation checks the wrong process state

- **Severity:** High
- **Confidence:** Confirmed Node API misuse
- **Evidence:** `src/lib/agent-task-scheduler.ts:196` and `src/lib/pi/process-manager.ts:289`
- **Problem:** Both grace-period callbacks check `child.killed`. In Node, `killed` means a signal was successfully sent, not that the process exited. It becomes true after SIGTERM, so a process that ignores SIGTERM is never escalated to SIGKILL. The scheduled task promise can then wait forever despite its timeout.
- **Impact:** Timed-out tasks can hang permanently; Pi restarts can leave orphan processes and create duplicate agents.
- **Isolated plan:** Add a subprocess test that ignores SIGTERM. Track process exit/close explicitly and escalate only while it has not exited.
- **Done when:** An uncooperative child is forcibly terminated after the grace period and no orphan remains.

### 10. MC-BUG-010 — Worker timers have no overlap, timeout, or output bounds

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** `src/lib/worker-timer-scheduler.ts:55` tracks jobs but not active runs; `src/lib/worker-timer-scheduler.ts:136-149` buffers complete stdout/stderr in memory.
- **Problem:** A new tick can start while the previous worker is still running. There is no execution timeout. Output grows without a cap until process exit even though only the last 10 KB is eventually stored.
- **Impact:** Slow or stuck workers can overlap indefinitely, exhaust memory/processes, and never finalize history.
- **Isolated plan:** Add lifecycle tests for overlapping ticks, a child that never exits, and large output. Add one per-timer running guard, a bounded transcript, and TERM/KILL timeout handling.
- **Done when:** One timer cannot overlap itself, stuck children terminate, and memory usage is bounded.

### 11. MC-BUG-011 — Command reorder accepts non-permutations and can corrupt commands

- **Severity:** High
- **Confidence:** Confirmed
- **Evidence:** `src/app/api/macros/[id]/commands/reorder/route.ts:27-37`
- **Problem:** Validation checks array length and non-negative integers but does not require every original index exactly once. Duplicate or out-of-range indices can duplicate, drop, or create malformed command entries before the corrupted array is saved.
- **Impact:** A bad request can silently destroy a macro's command ordering/content.
- **Isolated plan:** Add tests for duplicate, missing, and out-of-range indices. Require a true permutation of `0..commands.length-1` before updating.
- **Done when:** Invalid permutations return 400 without changing the macro.

### 12. MC-BUG-012 — Signaled macro processes are recorded as successful

- **Severity:** Medium
- **Confidence:** Confirmed
- **Evidence:** `src/lib/runner.ts:153`
- **Problem:** `close` resolves `code ?? 0`. Node supplies `code === null` when a process exits because of a signal, so termination by SIGTERM/SIGKILL is treated as exit code 0 and the macro can be marked successful.
- **Impact:** History and alerting can report success for interrupted or killed commands.
- **Isolated plan:** Add a command fixture that terminates itself by signal and assert failed history. Capture both `code` and `signal` from `close`.
- **Done when:** Any signaled command is finalized as failed with the signal recorded.

### 13. MC-BUG-013 — Macro deletion fails when schedules still reference it

- **Severity:** Medium
- **Confidence:** Confirmed from schema and delete path
- **Evidence:** `Schedule.macroId` uses a required foreign key with restrictive deletion; `deleteMacro()` directly deletes the macro, and the route returns a generic 500.
- **Problem:** A macro with one or more schedules cannot be deleted through the admin UI, and the user is not told to remove schedules first.
- **Impact:** Normal admin deletion unexpectedly fails.
- **Isolated plan:** Add a DB/route test for deleting a scheduled macro, decide between explicit 409 guidance and transactional schedule cleanup, then implement only that policy.
- **Done when:** The API returns intentional behavior and the UI communicates it accurately.

### 14. MC-BUG-014 — Slash-autocomplete selection is reset by async resource loading

- **Severity:** Medium
- **Confidence:** Confirmed by code and repeated flaky test
- **Evidence:** `src/components/pi-chat/slash-autocomplete.tsx:214-232`; five isolated test runs failed four times.
- **Problem:** Loading resources changes `commands`, which reruns the filter effect and resets `activeIndex` to zero. If the user presses ArrowUp/ArrowDown while the fetch resolves, the highlight jumps and the test becomes timing-dependent.
- **Impact:** Keyboard selection is unreliable and may execute a different command than the user highlighted.
- **Isolated plan:** Make the race deterministic with a deferred fetch test, then preserve/clamp the active selection when only the resource list changes.
- **Done when:** Deferred resource completion cannot undo keyboard navigation and the test passes repeatedly.

### 15. MC-BUG-015 — Energy-price sidebar badge does not clear when the target is removed

- **Severity:** Low
- **Confidence:** Confirmed state transition defect
- **Evidence:** `src/components/layout/sidebar-content.tsx:106-108`
- **Problem:** Polling updates `energyBetterCount` only when `targetRate != null`. A response with no target leaves the previous count in state.
- **Impact:** The sidebar can continue showing a stale “better rates” badge after the target is cleared.
- **Isolated plan:** Add a component test that transitions from a target/count response to `targetRate: null` and expects the badge to disappear.
- **Done when:** Clearing the target clears the badge without a page reload.

### 16. MC-BUG-016 — Numeric route IDs accept trailing garbage

- **Severity:** Low
- **Confidence:** Confirmed
- **Evidence:** Multiple agent-task, worker-timer, Proxmox, and log routes use `parseInt(id, 10)` and only reject `NaN`.
- **Problem:** Values such as `12junk` are accepted as ID 12. Other routes use `Number()` or Zod, so behavior is inconsistent.
- **Impact:** Malformed URLs can read or mutate an unintended valid record.
- **Isolated plan:** Add one shared route-validation convention using strict positive safe integers; migrate one route family per PR.
- **Done when:** Partial numeric strings, zero, negatives, overflow, and decimals are rejected consistently.

### 17. MC-BUG-017 — Deployment builds before applying migrations

- **Severity:** Medium
- **Confidence:** Confirmed ordering risk
- **Evidence:** Both `deploy/deploy.sh` and `deploy/install.sh` run `next build` before `prisma migrate deploy`.
- **Problem:** A release whose build-time page/module initialization requires a new schema can fail before the migration that would make the schema available. Fresh installs also build before creating the database schema.
- **Impact:** Deployments can fail on schema-changing releases even when the migration itself is valid.
- **Isolated plan:** Reproduce against a temporary empty/previous-schema database, then settle the intended order and rollback policy. Do not test against production data.
- **Done when:** Fresh install and previous-version upgrade both complete with a schema-changing release.

### 18. MC-BUG-018 — Next build traces the project and live development database

- **Severity:** Medium
- **Confidence:** Confirmed build warning and trace inspection
- **Evidence:** `just build` reports two “whole project was traced unintentionally” warnings through `src/lib/migrate.ts`. Generated NFT traces contain roughly 700 files and include `prisma/dev.db` references.
- **Problem:** Dynamic filesystem paths rooted at `process.cwd()` cause overly broad output-file tracing.
- **Impact:** Bloated or unsafe packaged artifacts may include files that are unrelated to a route, including a database reference; build warnings also hide future tracing regressions.
- **Isolated plan:** Identify the exact dynamic path expression and constrain/ignore only that runtime path. Compare NFT trace contents before and after.
- **Done when:** Build has no whole-project trace warning and route traces exclude `prisma/dev.db` and unrelated repository files.

## Quality-gate queue

These should follow the correctness/security queue unless they block an earlier item's regression test.

### 19. MC-QA-001 — `just lint` is obsolete

- **Evidence:** `justfile:145` runs `bun next lint`; Next 16 interprets `lint` as a project directory and exits before ESLint runs. `package.json` already has the correct `eslint` script.
- **Plan:** Make the Just recipe call the existing package lint command; do not change lint rules in the same PR.
- **Done when:** `just lint` actually invokes ESLint and reports the existing backlog.

### 20. MC-QA-002 — Two tests assert removed/changed behavior

- **Evidence:** The sidebar test expects an `Archive` section that no longer exists. The scraper test expects the exact string `Mozilla/5.0`, while the implementation deliberately sends a full Chrome user agent.
- **Plan:** For each test separately, confirm the current product requirement from the owning UI/scraper behavior, then update or restore behavior accordingly. Do not blindly make tests green.
- **Done when:** Each assertion matches an explicit current requirement.

### 21. MC-QA-003 — ESLint backlog is large enough to hide new defects

- **Evidence:** 154 errors/127 warnings overall; 50 errors/46 warnings in production code. Production errors include 27 `react-hooks/set-state-in-effect`, three `react-hooks/immutability`, six explicit `any`, and several API/component issues.
- **Plan:** Triage by rule, one rule family per PR. Start with hook immutability/purity issues that may indicate runtime bugs, then state-in-effect, then type/style-only findings. Avoid blanket rule disabling.
- **Done when:** `just lint` passes with no broad suppressions.

## Additional risks to revisit after the ordered queue

- Macro and history output buffers are unbounded; chatty commands can consume large memory/DB space.
- `sendAndWait()` correlates RPC responses only by command type, so concurrent identical commands may both resolve from the first response.
- Macro reorder performs multiple DB writes without a transaction and can leave partial ordering after a failure.
- The shared Pi singleton broadcasts every event to every connected browser; this is acceptable only under an explicit single-user trust model.
- Several API catches convert scheduler/validation failures into misleading 404 responses.

## Recommended first task

Start with **MC-BUG-001** only. It is a small, testable security boundary with the highest destructive impact. Do not combine authentication, token masking, or scheduler work into that change.
