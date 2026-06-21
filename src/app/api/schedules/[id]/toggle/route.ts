/**
 * POST /api/schedules/[id]/toggle
 * Toggles a schedule's enabled state and adds/removes it from the
 * in-process cron scheduler. Returns the updated schedule.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSchedule, toggleSchedule } from "@/lib/db/queries";
import { cronScheduler } from "@/lib/cron-scheduler";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid) || sid <= 0) {
    return NextResponse.json({ error: "Invalid schedule ID" }, { status: 400 });
  }

  try {
    const current = await getSchedule(sid);
    const updated = await toggleSchedule(sid);

    if (updated.enabled) {
      await cronScheduler.addSchedule(updated.id, updated.macroId, updated.cronExpression);
    } else {
      await cronScheduler.removeSchedule(updated.id);
    }

    return NextResponse.json({
      success: true,
      id: updated.id,
      enabled: updated.enabled,
      macro_id: updated.macroId,
      cron_expression: updated.cronExpression,
    });
  } catch (err) {
    const isNotFound =
      err instanceof Error &&
      (err.message.includes("findUniqueOrThrow") ||
        err.message.includes("Record to"));
    if (isNotFound) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    console.error("Failed to toggle schedule:", err);
    return NextResponse.json({ error: "Failed to toggle schedule" }, { status: 500 });
  }
}
