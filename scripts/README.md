# One-off Scripts

Place one-off TypeScript scripts here. Run them with:

```bash
just script scripts/my-script.ts
```

Or directly:

```bash
bun run scripts/my-script.ts
```

These scripts use `tsconfig.scripts.json` for type-checking, separate from the Next.js app.

## Conventions

- **Safe defaults.** Every mutating script defaults to dry-run mode. Pass
  `--run` to actually perform mutations. The banner always shows whether the
  run is LIVE or dry-run. The only exception is `command-runner.ts`, which is
  intentionally always-live (it is a passthrough SSH executor).

- **Export `main(argv?)`.** Scripts export `async function main(argv?: string[])`
  so unit tests can drive the entry point with controlled arguments. An
  `import.meta.main` guard separates the testable entry point from the CLI
  invocation.

- **Path resolution.** Scripts can import `@/lib/...` modules via the
  `paths` tsconfig mapping. Use `resolveConfig()` (async, reads DB + env) or
  `getConfig()` (sync, env-only) from `@/lib/config` for configuration.

- **Shared helpers.** Place shared CLI, log, collection, and format utilities
  in `scripts/_lib/`.

## Plex marker refresh

`scripts/plex/refresh-missing-markers.ts` finds episodes/movies missing intro
or credits markers and queues detection **only** for those items. Existing
markers are never re-run, nothing is force-redetected (no `force=1`), and the
Plex database is never touched.

```bash
# Report only (dry-run is the default)
just script scripts/plex/refresh-missing-markers.ts

# Restrict to one library
just script scripts/plex/refresh-missing-markers.ts -- --library "TV Shows"

# Queue missing detection after reviewing the report
just script scripts/plex/refresh-missing-markers.ts -- --run

# Re-queue items previously submitted but still missing markers
just script scripts/plex/refresh-missing-markers.ts -- --run --retry-attempted
```

Successful detection requests are recorded in
`~/.local/state/mission-control/plex-marker-refresh.json` so items Plex can't
detect aren't re-requested every run. Requires `PLEX_URL` and `PLEX_TOKEN`
(env or admin config page). Intro/credits detection needs Plex Pass.
