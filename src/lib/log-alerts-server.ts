/**
 * Server-only log alert helpers: DB watermark, journalctl, aggregation.
 *
 * This module imports `child_process` (`execFileSync`) and `@/lib/db`,
 * so it MUST NOT be imported by client components — only by API routes.
 * Pure helpers (isErrorLine, ERROR_RE, etc.) live in `./log-alerts.ts`.
 */
import { db } from "@/lib/db";
import { execFileSync } from "child_process";
import { countErrorsInText } from "./log-alerts";
import { getRecentAgentTaskHistory } from "@/lib/db/queries";

// ── Constants ──────────────────────────────────────────────────────────────

/** Maps service keys used by the web UI to systemd unit name suffixes. */
export const SERVICE_MAP: Record<string, string> = {
  web: "mission-control",
  "magnet-bridge": "mission-control-magnet-bridge",
  "broken-link-checker": "mission-control-broken-link-checker",
  scraper: "mission-control-scraper",
  "agent-tasks": "mission-control-agent-tasks",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SETTING_KEY = "log_alerts:acknowledged_at";

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

// ── Agent task history error counting ─────────────────────────────────────

/**
 * Count error lines across recent agent-task history runs, filtered to runs
 * whose startTime is at or after `sinceMs`.
 */
export async function countErrorsInAgentTaskHistory(sinceMs: number): Promise<number> {
  try {
    const runs = await getRecentAgentTaskHistory(undefined, 50);
    let count = 0;
    for (const run of runs) {
      if (run.startTime.getTime() < sinceMs) continue;
      if (run.output) {
        count += countErrorsInText(run.output);
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ── Aggregation with in-process cache ─────────────────────────────────────

export interface CountsResult {
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
    // Agent tasks are DB-backed, not journalctl-backed
    if (key === "agent-tasks") {
      const agentTaskErrors = await countErrorsInAgentTaskHistory(sinceMs);
      perService[key] = agentTaskErrors;
      total += agentTaskErrors;
      continue;
    }

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
 * Clear the in-process counts cache.
 * Called automatically by `setAcknowledgedAt` and available for tests.
 */
export function clearCountsCache(): void {
  countsCache = null;
}
