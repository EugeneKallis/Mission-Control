import { NextRequest, NextResponse } from "next/server";
import { fetchLogText } from "@/lib/log-fetcher";

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

  // Validate lines is a safe integer or "all"
  if (linesRaw !== "all" && !/^\d+$/.test(linesRaw)) {
    return new NextResponse(
      "Invalid lines parameter: must be a positive integer or 'all'",
      { status: 400 },
    );
  }
  const lines: "all" | number =
    linesRaw === "all" ? "all" : parseInt(linesRaw, 10);

  // Optional task id filter (agent-tasks only)
  let taskId: number | undefined;
  if (taskIdRaw !== null) {
    taskId = parseInt(taskIdRaw, 10);
    if (!Number.isFinite(taskId) || taskId < 1) {
      return new NextResponse(
        "Invalid task parameter: must be a positive integer",
        { status: 400 },
      );
    }
  }

  // Validate service exists
  const validServices = Object.keys(SERVICE_MAP);
  if (service !== "agent-tasks" && !SERVICE_MAP[service]) {
    return new NextResponse(
      `Unknown service: ${service}. Valid: ${validServices.join(", ")}, agent-tasks`,
      { status: 400 },
    );
  }

  const result = await fetchLogText(service, lines, taskId);

  if (result.error) {
    return new NextResponse(result.error, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(result.text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
