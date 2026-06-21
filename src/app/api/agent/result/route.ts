/**
 * POST /api/agent/result
 *
 * The agent calls this to deliver a command's streaming output or exit
 * code without waiting for the next heartbeat. Useful for low-latency
 * streaming of long-running commands.
 *
 * Body: { hostname, type: "output"|"exit"|"error", commandID, payload?, exitCode? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agentRegistry, type AgentMessage } from "@/lib/agents/registry";

const schema = z.object({
  hostname: z.string().min(1),
  type: z.enum(["output", "exit", "error"]),
  commandID: z.number().int(),
  payload: z.string().optional(),
  exitCode: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const msg: AgentMessage = {
    type: parsed.data.type,
    commandID: parsed.data.commandID,
    payload: parsed.data.payload,
    exitCode: parsed.data.exitCode,
  };
  agentRegistry.deliver(parsed.data.hostname, msg);

  return NextResponse.json({ success: true });
}
