/**
 * GET /api/logs/alerts
 *
 * Returns the number of error lines detected across all services
 * since the acknowledgement watermark (or the last 7 days, whichever
 * is tighter). The sidebar polls this every 60s for the nav badge.
 *
 * Response:
 *   {
 *     perService: Record<string, number>,  // keyed by service name
 *     total: number,
 *     acknowledgedAt: number | null         // epoch ms, null = never
 *   }
 *
 * Note: purely additive — acknowledgedAt is the watermark, total
 * counts errors since that watermark (or 7 days ago). "Mark Resolved"
 * (POST to .../acknowledge) sets acknowledgedAt to now, so future
 * polls return 0 until new errors arrive.
 */
import { NextResponse } from "next/server";
import { getAllLogAlertCounts } from "@/lib/log-alerts-server";

export async function GET() {
  const counts = await getAllLogAlertCounts();
  return NextResponse.json(counts);
}
