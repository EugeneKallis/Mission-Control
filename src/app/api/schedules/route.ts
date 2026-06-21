/**
 * GET  /api/schedules — list all schedules
 * POST /api/schedules — create a new schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listSchedules,
  createSchedule,
} from "@/lib/db/queries";
import { cronScheduler } from "@/lib/cron-scheduler";

const createSchema = z.object({
  macroId: z.number().int().positive("macroId must be a positive integer"),
  cronExpression: z.string().min(1, "cronExpression is required"),
  enabled: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const schedules = await listSchedules();
    return NextResponse.json(schedules);
  } catch (error) {
    console.error("Failed to list schedules:", error);
    return NextResponse.json(
      { error: "Failed to list schedules" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const schedule = await createSchedule(parsed.data);

    // Register with cron scheduler if enabled
    if (schedule.enabled) {
      await cronScheduler.addSchedule(
        schedule.id,
        schedule.macroId,
        schedule.cronExpression,
      );
    }

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("Failed to create schedule:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 },
    );
  }
}
