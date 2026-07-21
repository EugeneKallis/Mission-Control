/**
 * POST /api/agent-tasks/[id]/toggle — toggle a task's enabled/disabled state
 */

import { NextRequest, NextResponse } from "next/server";
import { toggleAgentTask, getAgentTask } from "@/lib/db/queries";
import { agentTaskScheduler } from "@/lib/agent-task-scheduler";
import { agentTaskRowToSpawnConfig } from "@/lib/pi/headless-prompt";

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
    const toggled = await toggleAgentTask(taskId);

    // Update scheduler: register or unregister the cron job
    if (toggled.enabled) {
      await agentTaskScheduler.addTask(taskId, agentTaskRowToSpawnConfig(toggled));
    } else {
      await agentTaskScheduler.removeTask(taskId);
    }

    return NextResponse.json(toggled);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
