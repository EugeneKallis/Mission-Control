/**
 * POST /api/schedules/timers/[id]/toggle — toggle a worker timer enabled/disabled
 */

import { NextRequest, NextResponse } from "next/server";
import { toggleWorkerTimer, getWorkerTimer } from "@/lib/db/queries";
import { workerTimerScheduler } from "@/lib/worker-timer-scheduler";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const timerId = parseInt(id, 10);
  if (isNaN(timerId)) {
    return NextResponse.json({ error: "Invalid timer id" }, { status: 400 });
  }

  try {
    const existing = await getWorkerTimer(timerId);
    const toggled = await toggleWorkerTimer(timerId);

    // Update the scheduler
    await workerTimerScheduler.updateTimer(
      timerId,
      toggled.workerPath,
      toggled.cronExpression,
      toggled.enabled,
    );

    return NextResponse.json(toggled);
  } catch {
    return NextResponse.json({ error: "Timer not found" }, { status: 404 });
  }
}
