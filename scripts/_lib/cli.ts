/**
 * Tiny CLI arg parser for one-off scripts.
 *
 * All Mission Control one-off scripts share the same flag conventions
 * (--dry-run, --limit, --delete, --workers, etc.). This helper keeps
 * the boilerplate out of every script.
 *
 *   const args = parseArgs({
 *     dryRun:   { type: "boolean", default: false },
 *     limit:    { type: "number",  default: 50 },
 *     workers:  { type: "number",  default: 4 },
 *     watchDir: { type: "string",  alias: "w" },
 *   });
 *
 * Supports `--key=value`, `--key value`, short aliases (`-w /path`),
 * and `--no-key` negation for boolean flags (e.g. `--no-dry-run`
 * sets `dryRun = false`). Unknown flags throw — fail loud at the
 * top, not deep in the run.
 */

export type ArgType = "boolean" | "string" | "number";

export interface ArgSpec {
  type: ArgType;
  default?: boolean | string | number;
  alias?: string; // single-letter short flag, e.g. "w" → -w
}

export type ArgSchema = Record<string, ArgSpec>;

export type ParsedArgs<S extends ArgSchema> = {
  [K in keyof S]: S[K]["type"] extends "boolean"
    ? boolean
    : S[K]["type"] extends "number"
      ? number
      : string;
} & { _: string[] };

export function parseArgs<S extends ArgSchema>(
  schema: S,
  argv: string[] = process.argv.slice(2),
): ParsedArgs<S> {
  const out: Record<string, unknown> = { _: [] as string[] };
  // Seed defaults so callers can rely on every key being present.
  for (const [key, spec] of Object.entries(schema)) {
    out[key] = spec.default ?? (spec.type === "string" ? "" : undefined);
  }

  const positional: string[] = (out._ as string[]);
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("-")) {
      positional.push(tok);
      continue;
    }

    // Strip leading dashes, resolve long vs short.
    const stripped = tok.replace(/^-+/, "");
    let key = stripped;
    let inlineValue: string | undefined;
    if (stripped.includes("=")) {
      [key, inlineValue] = stripped.split("=", 2);
    }

    // Detect `--no-<key>` negation (only valid for boolean flags and
    // only when the rest of the key matches a schema entry).
    if (key.startsWith("no-")) {
      const rest = key.slice(3);
      const negatedLongKey = Object.keys(schema).find(
        (k) => k === rest || k === kebabToCamel(rest),
      );
      if (negatedLongKey !== undefined) {
        const spec = schema[negatedLongKey];
        if (spec.type !== "boolean") {
          throw new Error(`--no-${rest} only valid for boolean flags (--${negatedLongKey} is ${spec.type})`);
        }
        out[negatedLongKey] = false;
        // --no-flag must not be followed by a value; consume the next
        // token only if it doesn't look like another flag.
        if (inlineValue === undefined) {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith("-")) {
            // Treat the next token as a positional, not a value, so the
            // negation stays a pure switch.
            positional.push(next);
            i++;
          }
        }
        continue;
      }
      // If `--no-<key>` doesn't match any schema entry, fall through
      // to the regular lookup so the error message is consistent.
    }

    const longKey =
      Object.keys(schema).find((k) => k === key || k === kebabToCamel(key)) ??
      Object.keys(schema).find((k) => {
        const alias = schema[k].alias;
        return alias === key || alias === kebabToCamel(key);
      });

    if (!longKey) {
      throw new Error(`Unknown flag: ${tok}`);
    }
    const spec = schema[longKey];

    let raw: string | undefined = inlineValue;
    if (raw === undefined) {
      // Consume the next token if it isn't another flag.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        raw = next;
        i++;
      } else if (spec.type === "boolean") {
        raw = "true";
      } else {
        throw new Error(`Flag --${longKey} requires a value`);
      }
    }

    out[longKey] = coerce(spec.type, raw, longKey);
  }

  return out as ParsedArgs<S>;
}

function coerce(type: ArgType, raw: string, key: string): boolean | string | number {
  if (type === "boolean") {
    if (raw === "true" || raw === "1" || raw === "") return true;
    if (raw === "false" || raw === "0") return false;
    throw new Error(`Flag --${key} expects boolean, got "${raw}"`);
  }
  if (type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`Flag --${key} expects number, got "${raw}"`);
    }
    return n;
  }
  return raw;
}

/** Convert `dry-run` → `dryRun` for tolerant flag matching. */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
