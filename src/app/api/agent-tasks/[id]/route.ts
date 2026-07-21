/**
 * GET    /api/agent-tasks/[id] — get a single agent task
 * PUT    /api/agent-tasks/[id] — update an agent task
 * DELETE /api/agent-tasks/[id] — delete an agent task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAgentTask, updateAgentTask, deleteAgentTask } from "@/lib/db/queries";
import { agentTaskScheduler } from "@/lib/agent-task-scheduler";

// ── Update Schema ─────────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  thinkingLevel: z.string().nullable().optional(),
  enabledTools: z.array(z.string()).nullable().optional(),
  disabledTools: z.array(z.string()).nullable().optional(),
  enabledSkills: z.array(z.string()).nullable().optional(),
  noSkills: z.boolean().optional(),
  appendSystem: z.string().nullable().optional(),
  persistSession: z.boolean().optional(),
  timeoutSec: z.number().int().min(1).optional(),
});

// ── GET ───────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  try {
    const task = await getAgentTask(taskId);
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
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
      { status: 400 },
    );
  }

  try {
    const existing = await getAgentTask(taskId);
    const updateData: Record<string, unknown> = {};

    // Build update payload, converting JSON array fields
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.prompt !== undefined) updateData.prompt = parsed.data.prompt;
    if (parsed.data.cronExpression !== undefined) updateData.cronExpression = parsed.data.cronExpression;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;
    if (parsed.data.provider !== undefined) updateData.provider = parsed.data.provider;
    if (parsed.data.model !== undefined) updateData.model = parsed.data.model;
    if (parsed.data.thinkingLevel !== undefined) updateData.thinkingLevel = parsed.data.thinkingLevel;
    if (parsed.data.enabledTools !== undefined) {
      updateData.enabledTools = parsed.data.enabledTools ? JSON.stringify(parsed.data.enabledTools) : null;
    }
    if (parsed.data.disabledTools !== undefined) {
      updateData.disabledTools = parsed.data.disabledTools ? JSON.stringify(parsed.data.disabledTools) : null;
    }
    if (parsed.data.enabledSkills !== undefined) {
      updateData.enabledSkills = parsed.data.enabledSkills ? JSON.stringify(parsed.data.enabledSkills) : null;
    }
    if (parsed.data.noSkills !== undefined) updateData.noSkills = parsed.data.noSkills;
    if (parsed.data.appendSystem !== undefined) updateData.appendSystem = parsed.data.appendSystem;
    if (parsed.data.persistSession !== undefined) updateData.persistSession = parsed.data.persistSession;
    if (parsed.data.timeoutSec !== undefined) updateData.timeoutSec = parsed.data.timeoutSec;

    const updated = await updateAgentTask(taskId, updateData);

    // Re-register with scheduler if currently enabled, or disable
    if (updated.enabled) {
      await agentTaskScheduler.addTask(taskId, {
        prompt: updated.prompt,
        provider: updated.provider,
        model: updated.model,
        thinkingLevel: updated.thinkingLevel,
        enabledTools: updated.enabledTools ? (JSON.parse(updated.enabledTools) as string[]) : null,
        disabledTools: updated.disabledTools ? (JSON.parse(updated.disabledTools) as string[]) : null,
        enabledSkills: updated.enabledSkills ? (JSON.parse(updated.enabledSkills) as string[]) : null,
        noSkills: updated.noSkills,
        appendSystem: updated.appendSystem,
        persistSession: updated.persistSession,
        taskId: updated.id,
      });
    } else {
      await agentTaskScheduler.removeTask(taskId);
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  try {
    // Stop the cron job first
    await agentTaskScheduler.removeTask(taskId);
    await deleteAgentTask(taskId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}
