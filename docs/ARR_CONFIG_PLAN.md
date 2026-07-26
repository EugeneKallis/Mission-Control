# Arr Website Configuration — Review and Implementation Plan

## Status

- **Plan:** Ready for implementation
- **Review baseline:** Uncommitted working tree compared with `HEAD`
- **Required coding model:** `deepseek/deepseek-v4-flash`
- **Writer safety:** Use one writer at a time in the active dirty worktree. Parallel subagents may review or plan, but must not edit the same worktree concurrently. Parallel coding is allowed only after creating isolated worktrees from a clean committed baseline.

## Goal

Allow the Config page to manage the ten built-in Radarr/Sonarr instance URLs and API keys, import the user's three-line format reliably, and make every runtime Arr consumer use the website-backed effective configuration.

Supported import shape:
```text
radarr
http://192.168.1.111:7878
<api-key>

radarr4k
http://192.168.1.111:7879
<api-key>
```
Blank lines between records must be optional because the supplied sample omits one between `radarrlocal` and `sonarr`.

## Confirmed Review Findings

### Blockers

1. **Eleven Arr script tests fail after switching scripts to `resolveConfig()`.**
   - Affected tests:
     - `scripts/arr/arr-searcher.test.ts`
     - `scripts/arr/radarr-sync.test.ts`
     - `scripts/arr/sonarr-sync.test.ts`
     - `scripts/arr/sonarr-season-searcher.test.ts`
   - Existing mocks export `getConfig`; changed scripts import `resolveConfig`, producing `SyntaxError: Export named 'resolveConfig' not found`.

2. **The import parser loses valid records from the supplied format.**
   - `src/app/admin/config/page.tsx:40-68` splits records only on blank lines and consumes only the first three lines in each block.
   - If two records are adjacent without a blank line, the second record is silently discarded.
   - Incomplete records are also silently skipped.

### High priority

3. **The Arr instance-map route still ignores DB-backed website configuration.**
   - `src/app/api/arr/instance-map/route.ts:2-6` calls synchronous `getConfig()`.
   - File-tree deep links therefore continue using env/default URLs even after users save URLs in the Config page.
   - Its tests also mock and describe `getConfig()`.

4. **Arr definitions and storage keys have multiple independent sources of truth.**
   - `src/lib/config.ts`: env schema and default instance list.
   - `src/app/api/config/route.ts`: twenty flat DB keys.
   - `src/app/admin/config/page.tsx`: ten instance names and key generation.
   - Adding or renaming an instance can silently desynchronize runtime resolution, API validation, and UI rendering.

5. **URL precedence is inconsistent with API-key and existing config precedence.**
   - API keys use `env > DB > default`.
   - `src/lib/config.ts` currently applies DB URLs unconditionally, effectively `DB > env > default`.
   - The new URL test claims to test env precedence but never sets an env URL.

### Medium priority

6. **The Config page has no component/parser tests.**
   - The pure parser is embedded in `page.tsx`, making edge cases harder to test.
   - Required cases include optional blank lines, unknown names, invalid URLs, duplicates, incomplete triples, and all ten names.

7. **The page does not show effective default URLs when no DB value exists.**
   - GET `/api/config` returns only stored JSON.
   - The UI initializes missing Arr URL fields to empty even though runtime instances have usable defaults.
   - Users cannot see the actual default endpoint before importing or saving.

8. **Validation is too permissive at the server seam.**
   - Arr URLs accept arbitrary strings.
   - Client `type="url"` is not sufficient for direct API callers.
   - Values are not consistently trimmed or normalized.

9. **Sensitive configuration responses need explicit cache handling.**
   - GET `/api/config` already exposes existing Plex/Real-Debrid secrets; this change expands that to ten Arr API keys.
   - Authentication is an existing application-wide concern and is out of scope here, but the route should return `Cache-Control: no-store` and tests should assert it.

### Cleanup/documentation

10. **Lint warnings.**
    - Files with unused imports, variables, or `as any` casts flagged by the project's lint rules.

11. **Documentation is stale or incomplete.**
    - Arr script docstrings still describe env-only configuration.
    - `.env.example` does not document URL overrides introduced by the current diff.
    - `AGENTS.md` does not document website-backed Arr configuration/import behavior, despite requiring new capabilities to be recorded.

12. **A pre-existing unrelated scripts type error blocks a completely green `just typecheck`.**
    - `scripts/diagnose-energy-prices.ts:66` passes `string | null` where `string` is required.
    - Do not hide or misattribute this baseline failure to the Arr work.

## Runtime Consumer Audit

### Must use DB-backed `resolveConfig()`

| Consumer | Current state | Required action |
|---|---|---|
| `scripts/arr/arr-searcher.ts` | Changed to `resolveConfig()` | Keep; repair tests |
| `scripts/arr/radarr-sync.ts` | Changed to `resolveConfig()` | Keep; repair tests |
| `scripts/arr/sonarr-sync.ts` | Changed to `resolveConfig()` | Keep; repair tests |
| `scripts/arr/sonarr-season-searcher.ts` | Changed to `resolveConfig()` | Keep; repair tests |
| `scripts/arr/sync-profiles.ts` | Changed to `resolveConfig()` | Keep; add focused coverage if practical |
| `scripts/plex/plex-to-arr.ts` | Already uses `resolveConfig()` | No runtime change; preserve tests |
| `src/app/api/arr/instance-map/route.ts` | Still uses `getConfig()` | Change to `await resolveConfig()`; update tests |

### Does not need Arr-related changes

| Consumer | Reason |
|---|---|
| `src/lib/clients/arr.ts` | Receives an `ArrInstance`; does not resolve configuration itself |
| `src/components/file-tree-viewer.tsx` | Consumes `/api/arr/instance-map`; route fix is sufficient |
| `src/workers/file-scanner.ts` | Uses `getConfig()` only for media paths, not Arr instances |
| Media cleanup scripts using `getConfig()` | Use media paths only, not Arr configuration |
| `scripts/plex/sync-recently-played.ts` | Already uses `resolveConfig()`; not an Arr client |

## Target Design

Create one pure, client-safe Arr configuration module as the canonical seam, for example:

```text
src/lib/arr-config.ts
```

Its interface should expose only what callers need:

- `ARR_INSTANCE_DEFINITIONS`
  - canonical name
  - normalized slug
  - type (`radarr` or `sonarr`)
  - default URL
  - env API-key key
  - env URL key
- `ArrInstanceName` / `ArrInstanceSlug`
- `arrConfigDbKey(slug, field)`
- `ARR_CONFIG_DB_KEYS`
- `parseArrImport(text)` returning structured entries plus structured issues

Keep the current flat DB keys for backward compatibility and to avoid a migration. Generate those keys from the canonical definitions instead of maintaining separate handwritten arrays.

### Required precedence

For both URL and API key:

```text
environment variable > stored website value > built-in default
```

The Config page edits the stored website value. Add help text explaining that environment variables override website values.

### Required parser behavior

1. Trim lines and ignore blank lines.
2. Consume non-empty lines in triples: `name`, `url`, `apiKey`.
3. Match built-in names case-insensitively.
4. Support all ten known instances.
5. Reject unknown names with a visible issue; do not add custom instances.
6. Validate `http:` or `https:` URLs.
7. Report incomplete trailing triples; do not silently discard them.
8. Report duplicate names and use the last valid occurrence.
9. Never log, toast, or include API-key values in validation messages.

## Work Packages

### Part 0 — Baseline and contracts

**Owner:** Review/planning subagent, read-only
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** None

Tasks:
- Reproduce the 11 focused test failures.
- Record the unrelated `scripts/diagnose-energy-prices.ts:66` typecheck failure as baseline.
- Confirm the ten canonical built-in Arr instances and precedence rules above.
- Do not edit source files.

Acceptance:
- Baseline command/output summary is attached to the implementation handoff.
- No existing failure is mislabeled as introduced by a later part.

### Part 1 — Canonical Arr configuration module

**Owner:** Coding subagent, sole writer
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Part 0

Primary files:
- New `src/lib/arr-config.ts`
- New `src/lib/arr-config.test.ts`
- `src/lib/config.ts`
- `src/lib/config.test.ts`
- `src/lib/config.resolve-config.test.ts`

Tasks:
- Move canonical names, slugs, types, default URLs, env keys, and DB-key generation into the pure module.
- Generate runtime Arr instances from the canonical definitions.
- Implement consistent `env > DB > default` precedence for URLs and API keys.
- Preserve fallback behavior when DB access or stored JSON parsing fails.
- Remove obsolete types/comments and rename the stale "fast path" test section.
- Add table-driven tests covering all ten instances and URL/API-key precedence.

Acceptance:
- No independent handwritten instance list remains in `config.ts`.
- All ten definitions resolve correctly from defaults, DB, and env.
- Environment values win for both fields.
- Config-focused tests pass.

### Part 2 — Config API contract and secret response behavior

**Owner:** Coding subagent, sole writer
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Part 1

Primary files:
- `src/app/api/config/route.ts`
- `src/app/api/config/route.test.ts`

Tasks:
- Generate the Arr key whitelist/schema from the canonical module.
- Validate and trim URL values; allow empty strings to clear stored overrides.
- Require non-empty URLs to use `http:` or `https:`.
- Keep API-key values opaque strings and never include them in error details.
- Add `Cache-Control: no-store` to GET and PUT responses containing config secrets.
- Preserve unrelated stored config keys during partial updates.
- Remove unused imports and weak casts where practical.

Acceptance:
- Unknown keys are ignored/rejected according to the existing whitelist behavior.
- Invalid Arr URL values return 400.
- Empty strings clear stored overrides.
- Representative Radarr and Sonarr keys round-trip.
- Response cache headers are tested.

### Part 3A — Config UI and robust import parser

**Owner:** Coding subagent, sole writer unless isolated worktree is used
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Parts 1 and 2

Primary files:
- `src/app/admin/config/page.tsx`
- New `src/components/config/arr-config-section.tsx` (recommended)
- New component tests under `src/components/config/`
- `src/lib/arr-config.ts` parser interface only if Part 1 did not finish it

Tasks:
- Render instances from canonical definitions instead of a local name list.
- Extract the Arr form section from the oversized page.
- Use the pure parser and show structured issues without exposing API keys.
- Handle adjacent triples without blank lines, matching the supplied sample.
- Show default URLs when no stored URL exists.
- Explain env-over-website precedence.
- Check fetch response status before using response bodies.
- Keep password fields and existing save behavior.
- Remove unused helpers.

Tests:
- Imports one record.
- Imports all ten records.
- Imports adjacent records with no blank separator.
- Case-insensitive names.
- Unknown name warning (`adarr` should be reported, not silently accepted).
- Invalid URL.
- Incomplete final record.
- Duplicate record behavior.
- Saving sends generated flat DB keys.
- Loading shows stored values and default URLs.

Acceptance:
- The exact supplied sample imports every valid record and reports only invalid names.
- No record is silently discarded.
- The page/component tests pass under the project happy-dom helper.

### Part 3B — Runtime consumers and tests

**Owner:** Coding subagent, sole writer unless isolated worktree is used
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Part 1
**Can run parallel with:** Part 3A only in an isolated worktree or with strict non-overlapping ownership

Primary files:
- `scripts/arr/*.ts`
- `scripts/arr/*.test.ts`
- `src/app/api/arr/instance-map/route.ts`
- `src/app/api/arr/instance-map/route.test.ts`
- `scripts/plex/plex-to-arr.ts` only if audit reveals a regression

Tasks:
- Keep all five Arr scripts on `await resolveConfig()`.
- Update test mocks to export async `resolveConfig()` instead of only `getConfig()`.
- Ensure tests do not read the developer or production DB.
- Change instance-map route to `await resolveConfig()`.
- Update route mocks/descriptions for async resolution.
- Add an assertion that DB-backed URLs appear in the instance map.
- Confirm `plex-to-arr.ts` already uses the correct resolver.
- Update script header comments to mention Config-page fallback and env precedence.

Acceptance:
- The current 11 Arr script failures are fixed.
- All focused Arr script tests pass with isolation.
- Instance-map tests prove website URLs are used.
- No runtime consumer that accesses `arrInstances` still calls env-only `getConfig()`.

### Part 4 — Documentation and cleanup

**Owner:** Coding/documentation subagent, sole writer
**Model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Parts 1–3

Primary files:
- `AGENTS.md`
- `.env.example`
- Relevant Arr script docstrings
- `docs/SERVERTOOL_MIRROR_PLAN.md` only if its Config section is intended to describe current capability

Tasks:
- Document website-backed Arr URL/API-key configuration.
- Document the import format, built-in-name restriction, and precedence.
- Add Arr URL env variables to `.env.example` if URL env overrides remain supported.
- Remove all lint warnings introduced or exposed by this change.
- Do not add a new Phase unless the project's phase tracker convention requires one for this capability.

Acceptance:
- `AGENTS.md` accurately describes the capability and runtime consumers.
- No changed-file lint warnings remain.

### Part 5 — Integration validation and adversarial review

**Owner:** Review subagents, read-only; fixes applied by one final coding subagent
**Review model:** `deepseek/deepseek-v4-flash`
**Fix model:** `deepseek/deepseek-v4-flash`
**Dependencies:** Parts 1–4

Validation commands:
```bash
bun test --isolate \
  src/lib/arr-config.test.ts \
  src/lib/config.test.ts \
  src/lib/config.resolve-config.test.ts \
  src/app/api/config/route.test.ts \
  src/app/api/arr/instance-map/route.test.ts \
  scripts/arr/arr-searcher.test.ts \
  scripts/arr/radarr-sync.test.ts \
  scripts/arr/sonarr-sync.test.ts \
  scripts/arr/sonarr-season-searcher.test.ts \
  src/components/config/*.test.tsx

bun tsc --noEmit --project tsconfig.json
bun tsc --noEmit --project tsconfig.test.json
bun tsc --noEmit --project tsconfig.scripts.json
bun eslint <all changed ts/tsx files>
git diff --check HEAD
```

Then run:
```bash
just test
just build
```

Review angles:
1. Correctness and precedence.
2. Import parser edge cases and UX.
3. Secret handling/API validation.
4. Runtime-consumer completeness.
5. Test quality and documentation.

Acceptance:
- Focused tests are green.
- App and test typechecks are green.
- Scripts typecheck is green or fails only on the explicitly recorded unrelated baseline issue.
- Full test/build results are reported without truncating or hiding failures.
- No Arr consumer bypasses DB-backed resolution.
- Reviewers find no blocker or high-priority issue.

## Recommended Subagent Execution Order

Because the worktree is already dirty, use sequential writers:
```text
Part 0 read-only baseline
  → Part 1 canonical module
  → Part 2 API
  → Part 3A UI
  → Part 3B consumers/tests
  → Part 4 docs
  → Part 5 parallel read-only review
  → one final fix writer if needed
```

If the current work is first committed into a clean baseline, Parts 3A and 3B may run concurrently in isolated worktrees and be merged before Part 4.

## Definition of Done

- Config page can edit all ten built-in Arr URLs and API keys.
- The supplied import format works with or without blank record separators.
- Unknown/malformed records are visible and never silently lost.
- Effective precedence is documented and tested: env > website DB > default.
- All Arr scripts, `plex-to-arr`, and instance-map use DB-backed effective configuration where needed.
- The 11 newly failing script tests are repaired.
- Config UI/parser, API, resolver, and instance-map have focused coverage.
- Secrets responses are non-cacheable.
- `AGENTS.md` and `.env.example` are current.
- Focused validation is green; unrelated baseline failures are reported explicitly.
