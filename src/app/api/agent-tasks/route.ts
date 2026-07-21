/**
 * GET  /api/agent-tasks — list all scheduled agent tasks
 * POST /api/agent-tasks — create a new scheduled agent task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAgentTasks, createAgentTask } from "@/lib/db/queries";
import { agentTaskScheduler } from "@/lib/agent-task-scheduler";
import { validateCronExpression } from "@/lib/cron";
import { getAllTools, discoverSkills } from "@/lib/pi/pi-settings";

// ── Create Schema ─────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "name is required"),
  prompt: z.string().min(1, "prompt is required"),
  cronExpression: z.string().min(1, "cronExpression is required"),
  enabled: z.boolean().optional().default(false),
  provider: z.string().nullable().optional().default(null),
  model: z.string().nullable().optional().default(null),
  thinkingLevel: z.string().nullable().optional().default(null),
  enabledTools: z.array(z.string()).nullable().optional().default(null),
  disabledTools: z.array(z.string()).nullable().optional().default(null),
  enabledSkills: z.array(z.string()).nullable().optional().default(null),
  noSkills: z.boolean().optional().default(false),
  appendSystem: z.string().nullable().optional().default(null),
  persistSession: z.boolean().optional().default(false),
  timeoutSec: z.number().int().min(1).optional().default(300),
});

// ── GET /api/agent-tasks ──────────────────────────────────────────────────

export async function GET() {
  try {
    const tasks = await listAgentTasks();
    const tools = getAllTools();
    const skills = discoverSkills();
    return NextResponse.json({ tasks, tools, skills });
  } catch (error) {
    console.error("Failed to list agent tasks:", error);
    return NextResponse.json({ error: "Failed to list agent tasks" }, { status: 500 });
  }
}

// ── POST /api/agent-tasks ─────────────────────────────────────────────────

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
      { status: 400 },
    );
  }

  // Validate cron expression
  const cronValid = validateCronExpression(parsed.data.cronExpression);
  if (cronValid !== null) {
    return NextResponse.json(
      { error: "Invalid cron expression" },
      { status: 400 },
    );
  }

  try {
    const task = await createAgentTask(parsed.data);

    // Register with scheduler if enabled
    if (task.enabled) {
      await agentTaskScheduler.addTask(task.id, {
        prompt: task.prompt,
        provider: task.provider,
        model: task.model,
        thinkingLevel: task.thinkingLevel,
        enabledTools: task.enabledTools ? (JSON.parse(task.enabledTools) as string[]) : null,
        disabledTools: task.disabledTools ? (JSON.parse(task.disabledTools) as string[]) : null,
        enabledSkills: task.enabledSkills ? (JSON.parse(task.enabledSkills) as string[]) : null,
        noSkills: task.noSkills,
        appendSystem: task.appendSystem,
        persistSession: task.persistSession,
        taskId: task.id,
      });
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Failed to create agent task:", error);
    return NextResponse.json({ error: "Failed to create agent task" }, { status: 500 });
  }
}
