/**
 * POST /api/logs/alerts/acknowledge
 *
 * Marks all existing alert errors as acknowledged by setting the
 * watermark to now. The sidebar badge (polled every 60s via
 * GET /api/logs/alerts) will return 0 until new error lines appear.
 *
 * Response: { ok: true }
 */
import { NextResponse } from "next/server";
import { setAcknowledgedAt } from "@/lib/log-alerts";

export async function POST() {
  const now = Date.now();
  await setAcknowledgedAt(now);
  return NextResponse.json({ ok: true, acknowledgedAt: now });
}
