/**
 * GET /api/pi/resources
 *
 * Returns available Pi tools and skills with their enabled/disabled state.
 * The process manager reads these settings at spawn time to construct CLI flags.
 *
 * Response shape:
 *   { tools: ToolInfo[], skills: SkillInfo[] }
 *
 * Each entry has an `enabled` boolean indicating whether it's active.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getResourceState,
  toggleTool,
  toggleSkill,
} from "@/lib/pi/pi-settings";
import { piProcessManager } from "@/lib/pi/process-manager";

export async function GET(): Promise<NextResponse> {
  try {
    const state = await getResourceState();
    return NextResponse.json(state);
  } catch (err) {
    console.error("[pi/resources] Failed to get resource state:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

interface ToggleBody {
  action: "toggle";
  type: "tool" | "skill";
  name: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ToggleBody;

    if (body.action !== "toggle" || !body.type || !body.name) {
      return NextResponse.json(
        { error: "Expected { action: 'toggle', type: 'tool'|'skill', name: string }" },
        { status: 400 },
      );
    }

    if (body.type === "tool") {
      await toggleTool(body.name);
    } else if (body.type === "skill") {
      await toggleSkill(body.name);
    } else {
      return NextResponse.json(
        { error: "type must be 'tool' or 'skill'" },
        { status: 400 },
      );
    }

    // Pi has no live RPC command for tool/skill enable-disable (only
    // set_model / set_thinking_level mutate a running session). Tool/skill
    // selection is spawn-time-only via --exclude-tools / --skill / --no-skills,
    // so to apply the change to the current chat we kill the singleton; the
    // next request re-spawns it with fresh flags. Conversation persists via
    // --session, so this is still "the same chat" to the user.
    try {
      piProcessManager.restart();
    } catch (err) {
      console.error("[pi/resources] Failed to restart pi singleton:", err);
    }

    // Return the updated state so the UI can refresh without a second GET.
    const state = await getResourceState();
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("[pi/resources] Failed to toggle:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
