# Model Dropdown for Agent-Task Form — Plan

> **Living document.** Agents update the Progress table and mark phases ✅ as they go.

## Goal

Replace the plain **Provider** and **Model** text `<input>`s in the Scheduled Agent Task form (`src/components/agent-tasks/agent-task-form.tsx`) with **dropdown `<select>`s** populated from Pi's live model registry — the same registry the Pi chat's `<ModelSelector>` modal uses. Reuse the existing fetch + type logic by extracting it into a shared hook.

## Design decisions

- **Extract a shared `usePiModels()` hook** into `src/hooks/use-pi-models.ts` (mirrors the existing `src/hooks/use-pi-stream.ts` pattern). It owns: the `PiModelEntry` type, the fetch-from-`/api/pi/state` logic (with the 404-retry-on-cold-start path), and `{ models, loading, error }` state. Both the chat `ModelSelector` modal and the agent-task form consume it. No behavior change to the chat modal.
- **Cascading `<select>` dropdowns** in the agent-task form: a Provider dropdown (entries grouped by `providerLabel`), then a Model dropdown filtered to the selected provider. The Model dropdown displays `m.name` (human label) but stores `m.id` into the form's `model` state and `m.provider` into the `provider` state. A "Default (Pi's configured default)" empty option is present when nothing is selected (provider="" model="" → the spawn args omit `--provider`/`--model`, falling back to Pi's default).
- **Graceful fallback**: if `usePiModels()` returns `error` (pi binary missing, API keys unconfigured, RPC failure), the form renders the *old* plain text inputs so the user can still type a provider/model manually. This keeps the form usable when Pi isn't reachable.
- **No DB / schema / API changes.** This is a pure frontend refactor + enhancement. The `AgentTask` model already stores `provider?` and `model?` as nullable strings.
- **Keep `PiModelEntry` importable from the old path** to avoid churn: `model-selector.tsx` re-exports `export type { PiModelEntry } from "@/hooks/use-pi-models"` so `status-bar.tsx`'s existing `import type { PiModelEntry } from "./model-selector"` keeps working. (Cleaner: also update `status-bar.tsx` to import from the hook.)

## Risks / edge cases

- **`/api/pi/state` spawns the pi singleton.** Calling it from the agent-task form (even when the chat isn't open) will boot the pi process. This is acceptable — it's the same behavior the chat triggers on open. The hook must clean up its fetch on unmount so it doesn't leak.
- **Cold-start 404.** `/api/pi/state` can 404 while the pi session is still connecting. The chat's `ModelSelector` retries up to 3 times with a 2s backoff. The hook must preserve that retry behavior.
- **Duplicate model `id` across providers** (e.g. `deepseek-v4-flash` shipped by both `deepseek` and `opencode-go`). The Model dropdown must key options by `${provider}/${id}` (React option keys aren't used by `<select>`, but the *value* must disambiguate — we store provider separately so we store just `m.id` in state; selecting a model sets *both* `provider` and `model` atomically, so the pair is always consistent).
- **Empty registry / loading state.** While `loading`, the dropdowns render disabled with a "Loading models…" placeholder. If `models.length === 0 && !loading && !error`, render the text inputs (same fallback path as the error case) so a misconfigured Pi doesn't brick the form.

## Progress table

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 — Shared hook | Extract `usePiModels()` + `PiModelEntry` into `src/hooks/use-pi-models.ts`; refactor `model-selector.tsx` to use it (no behavior change); add `use-pi-models.test.ts` | ✅ Done |
| Phase 2 — Form dropdowns | Replace Provider/Model inputs in `agent-task-form.tsx` with cascading `<select>`s driven by the hook; graceful fallback to text inputs on error/empty; add `agent-task-form.test.tsx` | ✅ Done |

---

## Phase 1 — Shared hook

**Files:**
- `src/hooks/use-pi-models.ts` (NEW) — exports `PiModelEntry` (moved from `model-selector.tsx`, identical shape) and `usePiModels()` (returns `{ models: PiModelEntry[]; loading: boolean; error: string | null }`). The hook encapsulates the fetch-from-`/api/pi/state` + 404-retry-up-to-3 + 2s-backoff + unmount-cleanup logic currently inlined in `ModelSelector`. Pure client hook (`"use client"`).
- `src/components/pi-chat/model-selector.tsx` (MODIFIED) — import `usePiModels` + the type from the hook; remove the inline `useEffect`/fetch + the `PiModelEntry` interface (re-export the type: `export type { PiModelEntry } from "@/hooks/use-pi-models"` so `status-bar.tsx`'s import keeps working). Zero behavior change to the modal.
- `src/hooks/use-pi-models.test.ts` (NEW) — tests (mirroring `model-selector.test.tsx`'s fetch-mock style): (a) fetch success → models populated, loading false; (b) fetch error → error set, models empty; (c) 404 then success → retries then resolves; (d) unmount during retry → no state update after unmount (use `waitFor` + assert no console error / final state intact). Use `@/test-utils/render` patterns are for components; for a hook use a tiny test harness component OR call the hook via a `renderHook`-style helper — check if `@/test-utils/render` exports a hook helper, otherwise render a `<div>` that calls the hook and asserts via `screen`. Mock `globalThis.fetch` and restore in `afterEach` exactly like `model-selector.test.tsx`.

**Acceptance:** `just typecheck` clean; chat `ModelSelector` modal still works (the existing `model-selector.test.tsx` still passes unchanged — it mocks fetch and renders the modal; since the modal now delegates to the hook, that test continues to pass because the hook behaves identically). New `use-pi-models.test.ts` passes. Commit as `feat(agent-tasks): model dropdown — phase 1 shared usePiModels hook`.

---

## Phase 2 — Form dropdowns

**Files:**
- `src/components/agent-tasks/agent-task-form.tsx` (MODIFIED) —
  - Import `usePiModels` + `PiModelEntry`.
  - In the Model / Provider / Thinking row, replace the Provider `<input>` and Model `<input>` with a cascading pair when `!loading && !error && models.length > 0`:
    - **Provider `<select>`**: options are unique providers from the models list, value `= m.provider`, label `= m.providerLabel ?? m.provider`. Include a leading `<option value="">Default</option>`. When the provider changes, if the current `model` isn't in the new provider's model set, reset `model` to `""`.
    - **Model `<select>`**: options are models filtered to the selected `provider` (or all models if provider is `""`), value `= m.id`, label `= m.name` (append " (needs key)" if `m.configured === false`). Include a leading `<option value="">Default</option>`. On `onChange`, find the model in the list and atomically `setModel(m.id)` + `setProvider(m.provider)`.
    - Both dropdowns styled to match the existing dark `<select>` style already used by the Thinking + Frequency dropdowns in this file (same `className`/`style`).
  - **Fallback path**: if `error || (!loading && models.length === 0)`, render the *original* two `<input>` text fields (keep the existing provider/model text inputs verbatim) so the form stays usable. While `loading`, render the dropdowns disabled with placeholder options ("Loading…").
  - Keep the Thinking + Timeout controls exactly as-is (no change).
- `src/components/agent-tasks/agent-task-form.test.tsx` (NEW) — render the form (it needs `resources` prop — pass `null` or a minimal fixture; `initial` prop — pass `null` for the "new task" case). Mock `globalThis.fetch` to return a small model list (reuse the `MOCK_MODELS` shape from `model-selector.test.tsx` with two providers sharing one model id to exercise the provider-disambiguation path). Assert: (a) Provider dropdown renders the two providers, (b) selecting a provider filters the Model dropdown to that provider's models, (c) selecting a model sets the form state such that submitting calls `onSubmit` with the correct `provider` + `model` (capture the `onSubmit` mock and inspect the payload), (d) fallback: if fetch rejects, the text inputs render instead. Use `@/test-utils/render`.

**Acceptance:** `just typecheck` clean; `just test` for the new test file passes (the 1 pre-existing `fetchHtml` failure is unrelated). Commit as `feat(agent-tasks): model dropdown — phase 2 cascading provider/model selects`.

---

## Notes for implementing agents

- Follow repo test conventions in `AGENTS.md` (bun:test, co-located `*.test.ts(x)`, `@/test-utils/render` for components, mock `globalThis.fetch` + restore in `afterEach`).
- Run `just typecheck` (or `bun run tsc --noEmit`) before committing each phase. `just test` is the gate; the pre-existing `fetchHtml` failure is unrelated and expected.
- Do NOT touch the Prisma schema, DB queries, scheduler, API routes, or `PLAN.md`.
- Do NOT launch subagents. You are the worker — just implement, test, and commit on the current branch (`feature/scheduled-agent-tasks` / `worktree/scheduled-agent-tasks`).
- Model `id` collides across providers — never use `m.id` alone as a React key or as the sole selection identity; always pair it with `m.provider`. The stored form state keeps `provider` and `model` as separate fields (the spawn args pass `--provider` and `--model` separately).
- Reference patterns: `src/hooks/use-pi-stream.ts` (hook style), `src/components/pi-chat/model-selector.tsx` (the fetch logic to extract), `src/components/pi-chat/model-selector.test.tsx` (fetch-mock style + `MOCK_MODELS`), `src/components/schedules/new-schedule-form.tsx` (dark `<select>` styling reference).