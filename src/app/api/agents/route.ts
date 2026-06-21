import { NextResponse } from "next/server";

/**
 * GET /api/agents
 * Returns list of connected agents.
 * Currently returns empty array since agent system (Part 11) is not built.
 * When Part 11 is implemented, this should query server_agents table.
 */
export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const agents = await db.serverAgent.findMany({
      orderBy: { lastSeen: "desc" },
    });
    return NextResponse.json(agents);
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
