/**
 * POST /api/agent-tasks/[id]/run — trigger an immediate one-off run
 *
 * Returns 202 Accepted with the history id (if created) once the run is
 * dispatched. The run completes asynchronously.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAgentTask } from "@/lib/db/queries";
import { agentTaskScheduler } from "@/lib/agent-task-scheduler";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  try {
    // Verify task exists
    await getAgentTask(taskId);

    // Dispatch run in background (fire-and-forget)
    void agentTaskScheduler.runNow(taskId);

    return NextResponse.json({ ok: true, taskId }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
