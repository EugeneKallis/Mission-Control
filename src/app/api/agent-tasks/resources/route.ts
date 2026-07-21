/**
 * GET /api/agent-tasks/resources
 *
 * Returns available Pi tools and skills for the task form.
 * Unlike /api/pi/resources this returns raw catalog data without
 * the global enabled/disabled state, so the per-task form can
 * independently manage its defaults.
 */

import { NextResponse } from "next/server";
import { getAllTools, discoverSkills } from "@/lib/pi/pi-settings";

export async function GET(): Promise<NextResponse> {
  try {
    const tools = getAllTools();
    const skills = discoverSkills();
    return NextResponse.json({ tools, skills });
  } catch (err) {
    console.error("[agent-tasks/resources] Failed to get resources:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
