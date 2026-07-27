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
  `--no-dry-run` (or the script-specific `--delete` / `--rm` flag) to actually
  perform mutations. The banner always shows whether the run is LIVE or dry-run.

- **Export `main(argv?)`.** Scripts export `async function main(argv?: string[])`
  so unit tests can drive the entry point with controlled arguments. An
  `import.meta.main` guard separates the testable entry point from the CLI
  invocation.

- **Path resolution.** Scripts can import `@/lib/...` modules via the
  `paths` tsconfig mapping. Use `resolveConfig()` (async, reads DB + env) or
  `getConfig()` (sync, env-only) from `@/lib/config` for configuration.

- **Shared helpers.** Place shared CLI, log, collection, and format utilities
  in `scripts/_lib/`.
