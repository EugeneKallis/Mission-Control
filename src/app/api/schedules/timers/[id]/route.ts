/**
 * PUT /api/schedules/timers/[id] — update a worker timer's cron expression
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkerTimer, updateWorkerTimer } from "@/lib/db/queries";
import { workerTimerScheduler } from "@/lib/worker-timer-scheduler";
import { CONCURRENCY_POLICIES } from "@/lib/scheduled-run-controller";

const updateSchema = z.object({
  cronExpression: z.string().min(1, "cronExpression is required"),
  concurrencyPolicy: z.enum(CONCURRENCY_POLICIES).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const timerId = parseInt(id, 10);
  if (isNaN(timerId)) {
    return NextResponse.json({ error: "Invalid timer id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const existing = await getWorkerTimer(timerId);
    const updated = await updateWorkerTimer(timerId, parsed.data);

    // Update the scheduler with new cron expression
    await workerTimerScheduler.updateTimer(
      timerId,
      updated.workerPath,
      updated.cronExpression,
      updated.enabled,
      updated.concurrencyPolicy as (typeof CONCURRENCY_POLICIES)[number],
    );

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Timer not found" }, { status: 404 });
  }
}
