/**
 * POST /api/agent-tasks/[id]/toggle — toggle a task's enabled/disabled state
 */

import { NextRequest, NextResponse } from "next/server";
import { toggleAgentTask, getAgentTask } from "@/lib/db/queries";
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
    const toggled = await toggleAgentTask(taskId);

    // Update scheduler: register or unregister the cron job
    if (toggled.enabled) {
      await agentTaskScheduler.addTask(taskId, {
        prompt: toggled.prompt,
        provider: toggled.provider,
        model: toggled.model,
        thinkingLevel: toggled.thinkingLevel,
        enabledTools: toggled.enabledTools ? (JSON.parse(toggled.enabledTools) as string[]) : null,
        disabledTools: toggled.disabledTools ? (JSON.parse(toggled.disabledTools) as string[]) : null,
        enabledSkills: toggled.enabledSkills ? (JSON.parse(toggled.enabledSkills) as string[]) : null,
        noSkills: toggled.noSkills,
        appendSystem: toggled.appendSystem,
        persistSession: toggled.persistSession,
        taskId: toggled.id,
      });
    } else {
      await agentTaskScheduler.removeTask(taskId);
    }

    return NextResponse.json(toggled);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
