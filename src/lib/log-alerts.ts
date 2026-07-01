/**
 * Shared log alert helpers: error detection, journalctl counting,
 * and watermark persistence via the `settings` table.
 *
 * The badge shows the number of error lines since the user's last
 * "Mark Resolved" (or the past 7 days, whichever is tighter).
 * Errors from web request lines (GET / POST ...) are excluded to
 * avoid noise from paths that happen to contain "error".
 */
import { db } from "@/lib/db";
import { execFileSync } from "child_process";

// ── Constants ──────────────────────────────────────────────────────────────

/** Case-insensitive error pattern used by both the badge and page highlight. */
export const ERROR_RE = /\b(error|fatal|panic|crash|exception|failed)\b/i;

/** Lines matching this pattern (web request noise) are ignored by isErrorLine. */
export const REQUEST_LINE_RE = /^\s*"?(GET|POST|PUT|DELETE|PATCH|HEAD) /;

/** Maps service keys used by the web UI to systemd unit name suffixes. */
export const SERVICE_MAP: Record<string, string> = {
  web: "mission-control",
  "magnet-bridge": "mission-control-magnet-bridge",
  "broken-link-checker": "mission-control-broken-link-checker",
  scraper: "mission-control-scraper",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SETTING_KEY = "log_alerts:acknowledged_at";

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

// ── DB watermark (acknowledged-at timestamp) ───────────────────────────────

/**
 * Read the acknowledged-at watermark from the settings table.
 * Returns null if never set.
 */
export async function getAcknowledgedAt(): Promise<number | null> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row?.value) return null;
  const ms = Number(row.value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Write the acknowledged-at watermark AND invalidate the in-process cache.
 * Called by POST /api/logs/alerts/acknowledge.
 */
export async function setAcknowledgedAt(ms: number): Promise<void> {
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: String(ms) },
    create: { key: SETTING_KEY, value: String(ms) },
  });
  clearCountsCache();
}

// ── Journalctl helpers ────────────────────────────────────────────────────

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Fetch journal output for a single unit, returning "" on failure
 * (dev machines without systemd → quiet 0, not a crash).
 */
export function runJournalctl(unit: string, sinceMs: number): string {
  try {
    const iso = isoFromMs(sinceMs);
    return execFileSync(
      "journalctl",
      ["-u", `${unit}.service`, "--since", iso, "--no-pager", "-o", "cat"],
      { encoding: "utf-8", timeout: 8000, maxBuffer: 5 * 1024 * 1024 },
    );
  } catch {
    return "";
  }
}

// ── Aggregation with in-process cache ─────────────────────────────────────

interface CountsResult {
  perService: Record<string, number>;
  total: number;
  acknowledgedAt: number | null;
}

let countsCache: { result: CountsResult; expiresAt: number } | null = null;
const CACHE_TTL_MS = 20_000;

/**
 * Count error lines across all services since the acknowledgement
 * watermark (or the last 7 days if no watermark set, whichever is
 * the tighter bound).
 *
 * In-memory cache with a 20s TTL so overlapping sidebar + logs-page
 * polls share the same journalctl work. The cache is invalidated
 * automatically when `setAcknowledgedAt` is called.
 */
export async function getAllLogAlertCounts(): Promise<CountsResult> {
  if (countsCache && Date.now() < countsCache.expiresAt) {
    return countsCache.result;
  }

  const ack = await getAcknowledgedAt();
  const weekAgo = Date.now() - WEEK_MS;
  const sinceMs = Math.max(ack ?? weekAgo, weekAgo);

  const perService: Record<string, number> = {};
  let total = 0;

  for (const [key, unit] of Object.entries(SERVICE_MAP)) {
    const text = runJournalctl(unit, sinceMs);
    const count = countErrorsInText(text);
    perService[key] = count;
    total += count;
  }

  const result: CountsResult = { perService, total, acknowledgedAt: ack };
  countsCache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

/**
 * Clear the in-process counts cache. Used by the acknowledge handler
 * (so the next poll picks up the new watermark) and by tests that
 * need to verify fresh journalctl calls.
 */
export function clearCountsCache(): void {
  countsCache = null;
}
