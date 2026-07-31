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
 * Fetch journal output for a single systemd service.
 *
 * Mirrors the `/api/logs` implementation: `lines="all"` first tries
 * `--since <ActiveEnterTimestamp>`, falling back to the last 10,000 lines if
 * `systemctl show` throws; numeric `lines` uses `-n`.
 *
 * Returns `{ text: "", error: "..." }` on failure so callers can decide
 * whether to display the error text (route) or count zero errors (badges).
 */
export function fetchJournalctlLogs(
  service: string,
  lines: "all" | number,
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

  try {
    const args: string[] = ["-u", serviceName, "--no-pager", "-o", "cat"];

    if (lines === "all") {
      try {
        const startOutput = execFileSync(
          "systemctl",
          ["show", "-p", "ActiveEnterTimestamp", "--value", serviceName],
          { encoding: "utf-8", timeout: 5000 },
        ).trim();
        if (startOutput && startOutput !== "n/a") {
          args.push("--since", startOutput);
        }
      } catch {
        args.push("-n", "10000");
      }
    } else {
      args.push("-n", String(lines));
    }

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
): Promise<LogFetchResult> {
  try {
    const limit = lines === "all" ? 50 : lines;
    const runs = await getRecentAgentTaskHistory(taskId, limit);

    const parts: string[] = [];
    for (const run of runs) {
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
): Promise<LogFetchResult> {
  if (service === "agent-tasks") {
    return fetchAgentTaskLogs(lines, taskId);
  }
  return fetchJournalctlLogs(service, lines);
}
