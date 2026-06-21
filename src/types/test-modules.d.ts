/**
 * Ambient module declarations for the test file dynamic-import pattern.
 *
 * Some tests re-import a module with a `?bust=<timestamp>` (or
 * `?fresh`, `?defaults`, etc.) query suffix to dodge the module cache
 * after `mock.module` has been called. TypeScript doesn't recognise
 * that pattern, so we declare a single catch-all that resolves to
 * `any` for type-checking purposes only — the runtime resolves these
 * to the actual file because Bun's loader strips the query string
 * before resolving.
 *
 * Note: the TypeScript module-pattern `*` does NOT span the `?`
 * character, so narrower patterns like `*?*` / `./*?*` / `@/*?*`
 * never match anything. A single `*` wildcard is the only thing that
 * covers all of `./foo?bust=1`, `@/lib/foo?bust=2`, etc.
 */

declare module "*" {
  const mod: any;
  export default mod;
  export = mod;
}
