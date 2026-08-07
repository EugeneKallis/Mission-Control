/**
 * Server-only log-fetching helper shared by the log-viewer endpoint and
 * the visible-window alert counter.
 *
 * Returns the same raw text that `/api/logs?service=<key>&lines=all` renders,
 * keeping the systemd/agent-tasks branches in one place so the window can
 * never drift between the pane and the per-tab badge counts.
 */
import { execFileSync } from "child_process";
import { getRecentAgentTaskHistory } from "@/lib/db/queries";

/** Maps service keys used by the web UI to systemd unit name suffixes. */
export const SERVICE_MAP: Record<string, string> = {
  web: "mission-control",
  "magnet-bridge": "mission-control-magnet-bridge",
  "broken-link-checker": "mission-control-broken-link-checker",
  scraper: "mission-control-scraper",
};

export interface LogFetchResult {
  text: string;
  error: string | null;
}

/**
 * Ask systemd for the most recent time the unit started.
 *
 * For running services this is `ActiveEnterTimestamp`. For an inactive
 * one-shot service (e.g. the scraper) `ActiveEnterTimestamp` may be
 * unavailable, so `InactiveExitTimestamp` (the last time the unit left the
 * inactive state) is used as a fallback.
 *
 * Returns `null` when the unit has no recorded start. Throws when the
 * `systemctl` subprocess itself fails (e.g. on a dev machine without systemd).
 */
function getLastStartTimestamp(unit: string): string | null {
  const output = execFileSync(
    "systemctl",
    [
      "show",
      "-p",
      "ActiveEnterTimestamp",
      "-p",
      "InactiveExitTimestamp",
      "--value",
      `${unit}.service`,
    ],
    { encoding: "utf-8", timeout: 5000 },
  ).trim();

  if (!output) return null;

  const candidates = output
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && s !== "n/a");

  if (candidates.length === 0) return null;

  let latest = candidates[0];
  let latestMs = new Date(latest).getTime();
  for (const ts of candidates.slice(1)) {
    const ms = new Date(ts).getTime();
    if (ms > latestMs) {
      latest = ts;
      latestMs = ms;
    }
  }
  return latest;
}

/**
 * Fetch journal output for a single systemd service.
 *
 * Returns only logs since the unit's most recent start. If the start time
 * cannot be determined, returns no logs rather than historical output. When
 * the unit has simply never started, an empty text response is returned.
 *
 * Returns `{ text: "", error: "..." }` on failure so callers can decide
 * whether to display the error text (route) or count zero errors (badges).
 */
export function fetchJournalctlLogs(
  service: string,
  lines: "all" | number,
  sinceMs?: number,
): LogFetchResult {
  const unit = SERVICE_MAP[service];
  if (!unit) {
    return {
      text: "",
      error: `Unknown service: ${service}. Valid: ${Object.keys(SERVICE_MAP).join(
        ", ",
      )}, agent-tasks`,
    };
  }

  const serviceName = `${unit}.service`;

  let since: string | null;
  try {
    since = getLastStartTimestamp(unit);
  } catch {
    return {
      text: "",
      error: `Unable to determine the most recent start for ${serviceName}; historical logs are not shown.`,
    };
  }

  // No recorded start means there are no "since last start" logs to show.
  if (!since) return { text: "", error: null };

  // Acknowledging alerts supplies a second lower bound. Keep the service
  // start as the default so the normal log view is unchanged, but after an
  // acknowledgement only return entries from the acknowledgement onward.
  if (sinceMs !== undefined) {
    const serviceStartMs = new Date(since).getTime();
    if (!Number.isFinite(serviceStartMs) || sinceMs > serviceStartMs) {
      since = new Date(sinceMs).toISOString();
    }
  }

  const args: string[] = ["-u", serviceName, "--no-pager", "-o", "cat"];
  args.push("--since", since);

  if (lines !== "all") args.push("-n", String(lines));

  try {
    const output = execFileSync("journalctl", args, {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024,
    });

    return { text: output, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: "",
      error: `Failed to fetch logs for ${serviceName}:\n${message}\n\nNote: Logs via journalctl require systemd. On dev machines without systemd, this endpoint will not work.`,
    };
  }
}

/**
 * Fetch the rendered transcript for agent-tasks history.
 *
 * `lines="all"` returns the latest 50 runs; numeric `lines` limits to that
 * many runs. Mirrors `/api/logs?service=agent-tasks&lines=...` output.
 */
export async function fetchAgentTaskLogs(
  lines: "all" | number,
  taskId?: number,
  sinceMs?: number,
): Promise<LogFetchResult> {
  try {
    const limit = lines === "all" ? 50 : lines;
    // Fetch the full visible window before applying the acknowledgement
    // watermark, otherwise old runs could occupy the numeric limit and hide
    // newer runs that should remain visible.
    const fetchLimit = sinceMs === undefined ? limit : Math.max(limit, 50);
    const runs = await getRecentAgentTaskHistory(taskId, fetchLimit);
    const visibleRuns = sinceMs === undefined
      ? runs
      : runs.filter((run) => run.startTime.getTime() >= sinceMs).slice(0, limit);

    const parts: string[] = [];
    for (const run of visibleRuns) {
      const taskName = run.agentTask?.name ?? `Task #${run.agentTaskId ?? "?"}`;
      const startTime = run.startTime.toISOString();
      const status = run.status;
      const header = `=== ${taskName} \u2014 ${startTime} \u2014 ${status} ===`;
      const output = run.output?.trim() || "(no output recorded)";
      parts.push(header + "\n" + output);
    }

    const text = parts.join("\n\n") || "(no agent task history)";
    return { text, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: "",
      error: `Failed to load agent task history:\n${message}`,
    };
  }
}

/**
 * Fetch the visible log text for a service.
 *
 * For `agent-tasks`, data comes from the DB; otherwise it comes from
 * `journalctl`. Returns the raw text on success and an error message
 * (with no text) on failure.
 */
export async function fetchLogText(
  service: string,
  lines: "all" | number = "all",
  taskId?: number,
  sinceMs?: number,
): Promise<LogFetchResult> {
  if (service === "agent-tasks") {
    return fetchAgentTaskLogs(lines, taskId, sinceMs);
  }
  return fetchJournalctlLogs(service, lines, sinceMs);
}
