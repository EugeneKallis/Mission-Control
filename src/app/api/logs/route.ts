import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";

const SERVICE_MAP: Record<string, string> = {
  web: "mission-control",
  "magnet-bridge": "mission-control-magnet-bridge",
  "broken-link-checker": "mission-control-broken-link-checker",
  scraper: "mission-control-scraper",
};

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") || "web";
  const linesRaw = request.nextUrl.searchParams.get("lines") || "100";
  const taskIdRaw = request.nextUrl.searchParams.get("task");

  // ── Agent Tasks: DB-backed branch ──────────────────────────────
  if (service === "agent-tasks") {
    // Validate lines parameter
    if (linesRaw !== "all" && !/^\d+$/.test(linesRaw)) {
      return new NextResponse(
        "Invalid lines parameter: must be a positive integer or 'all'",
        { status: 400 }
      );
    }

    // lines=all → 50 recent runs, N → N runs
    const limit = linesRaw === "all" ? 50 : parseInt(linesRaw, 10);

    // Optional task id filter
    let taskId: number | undefined;
    if (taskIdRaw !== null) {
      taskId = parseInt(taskIdRaw, 10);
      if (!Number.isFinite(taskId) || taskId < 1) {
        return new NextResponse(
          "Invalid task parameter: must be a positive integer",
          { status: 400 }
        );
      }
    }

    try {
      const { getRecentAgentTaskHistory } = await import("@/lib/db/queries");
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

      return new NextResponse(text, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new NextResponse(`Failed to load agent task history:\n${message}`, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  // ── Journalctl services ────────────────────────────────────────
  const unit = SERVICE_MAP[service];
  if (!unit) {
    return new NextResponse(
      `Unknown service: ${service}. Valid: ${Object.keys(SERVICE_MAP).join(", ")}, agent-tasks`,
      { status: 400 }
    );
  }

  // Validate lines is a safe integer or "all"
  if (linesRaw !== "all" && !/^\d+$/.test(linesRaw)) {
    return new NextResponse("Invalid lines parameter: must be a positive integer or 'all'", {
      status: 400,
    });
  }

  const serviceName = `${unit}.service`;

  try {
    const args: string[] = ["-u", serviceName, "--no-pager", "-o", "cat"];

    if (linesRaw === "all") {
      // Try to get logs since last service start
      try {
        const startOutput = execFileSync("systemctl", [
          "show",
          "-p",
          "ActiveEnterTimestamp",
          "--value",
          serviceName,
        ], { encoding: "utf-8", timeout: 5000 }).trim();
        if (startOutput && startOutput !== "n/a") {
          args.push("--since", startOutput);
        }
      } catch {
        // Fall back to last 10000 lines
        args.push("-n", "10000");
      }
    } else {
      args.push("-n", linesRaw);
    }

    const output = execFileSync("journalctl", args, {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024, // 5MB
    });

    return new NextResponse(output, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = `Failed to fetch logs for ${serviceName}:\n${message}\n\nNote: Logs via journalctl require systemd. On dev machines without systemd, this endpoint will not work.`;
    return new NextResponse(fallback, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
