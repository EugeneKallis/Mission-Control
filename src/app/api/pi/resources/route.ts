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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pi/resources] Failed to toggle:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
