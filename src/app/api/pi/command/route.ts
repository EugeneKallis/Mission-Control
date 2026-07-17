/**
 * POST /api/pi/command — send RPC commands to the singleton Pi process.
 *
 * All browser connections share the same Pi process.
 * Supports: prompt, abort, steer, follow_up, and all other RPC commands.
 */

import { NextRequest, NextResponse } from "next/server";
import { piProcessManager } from "@/lib/pi/process-manager";
import type { RpcCommand } from "@/lib/pi/event-types";

const VALID_COMMANDS = new Set([
  "prompt", "abort", "steer", "follow_up",
  "new_session", "get_state", "get_messages",
  "set_model", "get_available_models", "set_thinking_level",
  "cycle_model", "cycle_thinking_level", "compact",
  "get_session_stats", "switch_session", "fork", "clone",
  "get_entries", "get_tree", "set_session_name",
  "get_commands", "bash", "export_html",
  "set_auto_compaction", "set_auto_retry", "abort_retry", "abort_bash",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const process = await piProcessManager.getOrCreate();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type } = body;
  if (!type || typeof type !== "string") {
    return NextResponse.json({ error: "Missing 'type' field" }, { status: 400 });
  }

  if (!VALID_COMMANDS.has(type)) {
    return NextResponse.json({ error: `Unknown command type: ${type}` }, { status: 400 });
  }

  if ((type === "prompt" || type === "steer" || type === "follow_up") && !body.message) {
    return NextResponse.json(
      { error: `'${type}' requires a 'message' field` },
      { status: 400 },
    );
  }

  try {
    process.send(body as unknown as RpcCommand);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send command" },
      { status: 500 },
    );
  }
}
