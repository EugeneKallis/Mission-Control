/**
 * GET    /api/schedules/[id] — get single schedule
 * PUT    /api/schedules/[id] — update schedule
 * DELETE /api/schedules/[id] — delete schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/db/queries";
import { cronScheduler } from "@/lib/cron-scheduler";

const updateSchema = z.object({
  macroId: z.number().int().positive().optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const schedule = await getSchedule(Number(id));
    return NextResponse.json(schedule);
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      (error.message.includes("findUniqueOrThrow") ||
        error.message.includes("Record to"));
    if (isNotFound) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }
    console.error("Failed to fetch schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sid = Number(id);
  try {
    // Fetch current schedule to merge with update data
    const current = await getSchedule(sid);
    const updated = await updateSchedule(sid, parsed.data);

    // Sync with cron scheduler
    await cronScheduler.updateSchedule(
      sid,
      updated.macroId,
      updated.cronExpression,
      updated.enabled,
    );

    return NextResponse.json(updated);
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      (error.message.includes("findUniqueOrThrow") ||
        error.message.includes("Record to"));
    if (isNotFound) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }
    console.error("Failed to update schedule:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sid = Number(id);
  try {
    await deleteSchedule(sid);
    await cronScheduler.removeSchedule(sid);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete schedule:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 },
    );
  }
}
