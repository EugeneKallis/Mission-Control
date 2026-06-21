/**
 * POST /api/agent/heartbeat
 *
 * The agent calls this endpoint to:
 *  1. Report its current status (CPU, memory, version, network, IP)
 *  2. Deliver any in-flight command output/exit (the agent's `result`
 *     payload is merged into the heartbeat body)
 *  3. Receive any pending command the server wants to dispatch
 *
 * The heartbeat doubles as the agent→server channel for command results.
 * This keeps the API surface tiny: one POST for status + results + the
 * server's response carries the next command.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertServerAgent } from "@/lib/db/queries";
import { agentRegistry, type AgentMessage } from "@/lib/agents/registry";

const heartbeatSchema = z.object({
  hostname: z.string().min(1),
  ip_address: z.string().optional(),
  cpu_usage: z.number().min(0).max(100).optional(),
  memory_total: z.number().int().nonnegative().optional(),
  memory_used: z.number().int().nonnegative().optional(),
  version: z.string().optional(),
  network_sent: z.number().int().nonnegative().optional(),
  network_recv: z.number().int().nonnegative().optional(),
  /** Optional: deliver a command result alongside the heartbeat. */
  result: z
    .object({
      type: z.enum(["output", "exit", "error"]),
      commandID: z.number().int(),
      payload: z.string().optional(),
      exitCode: z.number().int().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { hostname, result, ...status } = parsed.data;

  // Upsert the agent row
  try {
    await upsertServerAgent({
      hostname,
      ipAddress: status.ip_address ?? null,
      cpuUsage: status.cpu_usage ?? null,
      memoryTotal: status.memory_total ?? null,
      memoryUsed: status.memory_used ?? null,
      version: status.version ?? null,
      networkSent: status.network_sent ?? 0,
      networkRecv: status.network_recv ?? 0,
    });
  } catch (err) {
    console.error(`[agent] heartbeat upsert failed for ${hostname}:`, err);
    return NextResponse.json({ error: "Failed to upsert agent" }, { status: 500 });
  }

  // If the agent delivered a result, route it to the pending command
  if (result) {
    const msg: AgentMessage = {
      type: result.type,
      commandID: result.commandID,
      payload: result.payload,
      exitCode: result.exitCode,
    };
    agentRegistry.deliver(hostname, msg);
  }

  return NextResponse.json({
    success: true,
    ts: Date.now(),
  });
}
