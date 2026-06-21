import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";

const SERVICE_MAP: Record<string, string> = {
  web: "mission-control",
  "magnet-bridge": "magnet_bridge",
};

export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") || "web";
  const linesRaw = request.nextUrl.searchParams.get("lines") || "100";

  const unit = SERVICE_MAP[service];
  if (!unit) {
    return new NextResponse(
      `Unknown service: ${service}. Valid: ${Object.keys(SERVICE_MAP).join(", ")}`,
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
