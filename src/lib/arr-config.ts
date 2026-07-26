/**
 * Canonical Arr instance configuration.
 *
 * Single source of truth for the ten built-in Radarr/Sonarr instances:
 * names, slugs, types, default URLs, env variable keys, and DB storage keys.
 *
 * Precedence (for both URL and API key):
 *   environment variable > stored website value > built-in default
 *
 * Every runtime consumer that resolves Arr instances must go through
 * `resolveArrInstances()` from this module so precedence is consistent.
 */

import type { ArrInstance } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ArrDefinition {
  /** Display name (e.g. "Radarr", "Radarr4K") */
  name: string;
  /** Normalized slug (e.g. "radarr", "radarr4k") */
  slug: string;
  /** Instance type */
  type: "radarr" | "sonarr";
  /** Built-in default URL */
  defaultUrl: string;
}

// ── Canonical definitions ─────────────────────────────────────────────────

export const ARR_INSTANCE_DEFINITIONS: readonly ArrDefinition[] = [
  { name: "Radarr",      slug: "radarr",      type: "radarr", defaultUrl: "http://192.168.1.111:7878" },
  { name: "Radarr4K",    slug: "radarr4k",    type: "radarr", defaultUrl: "http://192.168.1.111:7879" },
  { name: "RadarrKids",  slug: "radarrkids",  type: "radarr", defaultUrl: "http://192.168.1.111:7880" },
  { name: "RadarrAnime", slug: "radarranime", type: "radarr", defaultUrl: "http://192.168.1.111:7881" },
  { name: "RadarrLocal", slug: "radarrlocal", type: "radarr", defaultUrl: "http://192.168.1.111:7882" },
  { name: "Sonarr",      slug: "sonarr",      type: "sonarr", defaultUrl: "http://192.168.1.111:8989" },
  { name: "Sonarr4K",    slug: "sonarr4k",    type: "sonarr", defaultUrl: "http://192.168.1.111:8990" },
  { name: "SonarrKids",  slug: "sonarrkids",  type: "sonarr", defaultUrl: "http://192.168.1.111:8991" },
  { name: "SonarrAnime", slug: "sonarranime", type: "sonarr", defaultUrl: "http://192.168.1.111:8992" },
  { name: "SonarrLocal", slug: "sonarrlocal", type: "sonarr", defaultUrl: "http://192.168.1.111:8993" },
];

// ── Derived types ─────────────────────────────────────────────────────────

export type ArrInstanceSlug = (typeof ARR_INSTANCE_DEFINITIONS)[number]["slug"];
export type ArrInstanceName = (typeof ARR_INSTANCE_DEFINITIONS)[number]["name"];

// ── Env key helpers ───────────────────────────────────────────────────────

/**
 * Return the env var key for a given instance's API key.
 * Example: "radarr" → "ARR__RADARR__API_KEY"
 */
export function envKeyForApiKey(slug: string): string {
  return `ARR__${slug.toUpperCase()}__API_KEY`;
}

/**
 * Return the env var key for a given instance's URL.
 * Example: "radarr" → "ARR__RADARR__URL"
 */
export function envKeyForUrl(slug: string): string {
  return `ARR__${slug.toUpperCase()}__URL`;
}

// ── DB key helpers ────────────────────────────────────────────────────────

/**
 * Return the flat DB config key for a given instance slug and field.
 * Example: arrConfigDbKey("radarr", "url") → "arr_radarr_url"
 */
export function arrConfigDbKey(slug: string, field: "url" | "api_key"): string {
  return `arr_${slug}_${field}`;
}

/**
 * All flat DB keys for Arr instances, generated from canonical definitions.
 * Used by the config API route for whitelist/validation, and by the UI for
 * field generation.
 */
export const ARR_CONFIG_DB_KEYS: readonly string[] = ARR_INSTANCE_DEFINITIONS.flatMap((d) => [
  arrConfigDbKey(d.slug, "url"),
  arrConfigDbKey(d.slug, "api_key"),
]);

// ── Runtime resolution ────────────────────────────────────────────────────

/**
 * Resolve Arr instances with env > DB > default precedence.
 *
 * @param env      Parsed environment variables (Record<string, string>).
 *                 Values from process.env or a mock.
 * @param dbValues Config JSON from the website Config page (may be partial).
 *                 Omit or pass empty object for env-only resolution.
 * @returns Resolved ArrInstance[] with all ten instances.
 */
export function resolveArrInstances(
  env: Record<string, string>,
  dbValues: Record<string, string> = {},
): ArrInstance[] {
  return ARR_INSTANCE_DEFINITIONS.map((def) => {
    const apiKey = pickValue(
      env[envKeyForApiKey(def.slug)],
      dbValues[arrConfigDbKey(def.slug, "api_key")],
      "",
    );
    const url = pickValue(
      env[envKeyForUrl(def.slug)],
      dbValues[arrConfigDbKey(def.slug, "url")],
      def.defaultUrl,
    );
    return { type: def.type, name: def.name, url, apiKey };
  });
}

/**
 * Precedence helper: first value that is non-null and non-empty wins.
 */
function pickValue(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    if (c && c.length > 0) return c;
  }
  return "";
}

// ── Import parser ─────────────────────────────────────────────────────────

/** A single successfully parsed entry from bulk-import text. */
export interface ParsedArrEntry {
  /** Canonical name (e.g. "Radarr") */
  name: string;
  /** Normalized slug */
  slug: string;
  /** URL from the import text */
  url: string;
  /** API key from the import text */
  apiKey: string;
}

export type ArrImportIssueType =
  | "unknown_name"
  | "invalid_url"
  | "incomplete_record"
  | "duplicate_name";

export interface ArrImportIssue {
  type: ArrImportIssueType;
  /** Human-readable message. Never includes API key values or secret material. */
  message: string;
}

export interface ArrImportResult {
  /** Successfully parsed entries (one per valid triple). */
  entries: ParsedArrEntry[];
  /** Non-blocking issues found during parsing. */
  issues: ArrImportIssue[];
}

/**
 * Parse bulk-import text in the format:
 *
 * ```
 * radarr
 * http://192.168.1.111:7878
 * replace-with-radarr-api-key
 *
 * radarr4k
 * http://192.168.1.111:7879
 * replace-with-radarr4k-api-key
 * ```
 *
 * Adjacent triples without a blank-line separator are also supported.
 *
 * Rules:
 * 1. Lines are trimmed; blank lines are ignored.
 * 2. Non-empty lines are consumed in triples: name, url, apiKey.
 * 3. Names are matched case-insensitively against the ten built-in instances.
 * 4. Unknown names produce an issue; they are not added as custom instances.
 * 5. URLs must start with http:// or https://.
 * 6. Incomplete trailing triples produce an issue.
 * 7. Duplicate names produce an issue; the last occurrence wins.
 * 8. API key values never appear in issue messages.
 */
export function parseArrImport(text: string): ArrImportResult {
  const issues: ArrImportIssue[] = [];
  let entries: ParsedArrEntry[] = [];

  // Build a case-insensitive lookup: lowercase name → definition
  const defByName = new Map<string, (typeof ARR_INSTANCE_DEFINITIONS)[number]>();
  for (const def of ARR_INSTANCE_DEFINITIONS) {
    defByName.set(def.name.toLowerCase(), def);
  }

  // Collect non-empty trimmed lines
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { entries, issues };

  // Process in groups of 3
  const triples: string[][] = [];
  for (let i = 0; i < lines.length; i += 3) {
    const triple = lines.slice(i, i + 3);
    if (triple.length < 3) {
      issues.push({
        type: "incomplete_record",
        message: `Incomplete record at line ${i + 1}: expected name, url, and api_key but only ${triple.length} line(s) found.`,
      });
      continue;
    }
    triples.push(triple);
  }

  // Track duplicates by slug (only VALID entries participate in last-wins)
  const seenSlugs = new Set<string>();

  for (let idx = 0; idx < triples.length; idx++) {
    const [rawName, url, _apiKey] = triples[idx];
    const nameLower = rawName.toLowerCase();
    const def = defByName.get(nameLower);

    if (!def) {
      issues.push({
        type: "unknown_name",
        message: `Unknown instance "${rawName}" — only the 10 built-in names (Radarr, Radarr4K, Sonarr, etc.) are supported.`,
      });
      continue;
    }

    // Detect duplicates BEFORE URL validation so both issues are reported
    if (seenSlugs.has(def.slug)) {
      issues.push({
        type: "duplicate_name",
        message: `Duplicate "${def.name}" — using the last occurrence.`,
      });
    }
    seenSlugs.add(def.slug);

    // Validate URL — invalid entries are NOT populated into the form
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      issues.push({
        type: "invalid_url",
        message: `Invalid URL for "${def.name}": must start with http:// or https://.`,
      });
      continue;
    }

    // Remove any previous valid entry for this slug (last occurrence wins)
    entries = entries.filter((e) => e.slug !== def.slug);

    entries.push({
      name: def.name,
      slug: def.slug,
      url,
      apiKey: _apiKey,
    });
  }

  return { entries, issues };
}
