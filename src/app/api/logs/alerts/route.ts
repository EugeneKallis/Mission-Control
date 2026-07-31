/**
 * GET /api/logs/alerts
 *
 * Returns the number of error lines detected across all services.
 *
 * Default mode (no `window` query param): counts since the acknowledgement
 * watermark (or the last 7 days, whichever is tighter). This powers the
 * aggregate header pill and the sidebar nav badge.
 *
 * `?window=visible`: counts errors in the same log content shown by
 * `/api/logs?service=<key>&lines=all` (service start → now for systemd services,
 * latest 50 runs for agent tasks). This powers the per-service tab badges.
 *
 * Response shape for both modes:
 *   {
 *     perService: Record<string, number>,  // keyed by service name
 *     total: number,
 *     acknowledgedAt: number | null         // epoch ms, null = never
 *   }
 *
 * "Mark Resolved" (POST to .../acknowledge) sets the acknowledgedAt watermark
 * to now, so future default-mode polls return 0 until new errors arrive.
 * The visible window is unaffected by acknowledgement.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllLogAlertCounts, getVisibleLogAlertCounts } from "@/lib/log-alerts-server";

export async function GET(request: NextRequest) {
  const window = request.nextUrl.searchParams.get("window");
  const counts =
    window === "visible"
      ? await getVisibleLogAlertCounts()
      : await getAllLogAlertCounts();
  return NextResponse.json(counts);
}
