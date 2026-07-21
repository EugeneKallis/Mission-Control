/**
 * GET /api/agent-tasks/[id]/runs — recent run history for a task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRecentAgentTaskHistory } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 20;

  try {
    const history = await getRecentAgentTaskHistory(taskId, Math.min(limit, 100));
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
