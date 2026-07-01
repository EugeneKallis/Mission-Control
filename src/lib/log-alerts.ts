/**
 * Client-safe log alert helpers: error detection regex + pure helpers.
 *
 * This module intentionally avoids `child_process` and DB imports so it
 * can be safely imported by client components (`page.tsx`).
 *
 * Server-only logic (DB watermark, journalctl, aggregation) lives in
 * `./log-alerts-server.ts`.
 */
// ── Constants ──────────────────────────────────────────────────────────────

/** Case-insensitive error pattern used by both the badge and page highlight. */
export const ERROR_RE = /\b(error|fatal|panic|crash|exception|failed)\b/i;

/** Lines matching this pattern (web request noise) are ignored by isErrorLine. */
export const REQUEST_LINE_RE = /^\s*"?(GET|POST|PUT|DELETE|PATCH|HEAD) /;

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Returns true if a log line contains an error (and isn't a request line). */
export function isErrorLine(line: string): boolean {
  if (REQUEST_LINE_RE.test(line)) return false;
  return ERROR_RE.test(line);
}

/** Count error lines in a blob of journalctl output. */
export function countErrorsInText(text: string): number {
  if (!text) return 0;
  return text.split("\n").filter((l) => isErrorLine(l)).length;
}
