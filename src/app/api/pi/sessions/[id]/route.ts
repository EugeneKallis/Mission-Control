/**
 * DELETE /api/pi/sessions/[id] — delete a saved Pi session directory.
 */

import { NextRequest, NextResponse } from "next/server";
import { existsSync, rmSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";

const SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
  }

  // Sanitize: prevent path traversal
  const sessionId = basename(id);
  if (sessionId !== id) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const sessionDir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(sessionDir)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    rmSync(sessionDir, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete session" },
      { status: 500 },
    );
  }
}
