/**
 * GET  /api/schedules/timers — list all worker timers
 * POST /api/schedules/timers — create a new worker timer
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listWorkerTimers, createWorkerTimer } from "@/lib/db/queries";
import { workerTimerScheduler, WORKER_REGISTRY } from "@/lib/worker-timer-scheduler";

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  workerPath: z.string().min(1, "workerPath is required"),
  cronExpression: z.string().min(1, "cronExpression is required"),
  enabled: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const timers = await listWorkerTimers();
    return NextResponse.json({ timers, registry: WORKER_REGISTRY });
  } catch (error) {
    console.error("Failed to list timers:", error);
    return NextResponse.json({ error: "Failed to list timers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const timer = await createWorkerTimer(parsed.data);

    // Register with scheduler if enabled
    if (timer.enabled) {
      await workerTimerScheduler.addTimer(timer.id, timer.workerPath, timer.cronExpression);
    }

    return NextResponse.json(timer, { status: 201 });
  } catch (error) {
    console.error("Failed to create timer:", error);
    return NextResponse.json({ error: "Failed to create timer" }, { status: 500 });
  }
}
