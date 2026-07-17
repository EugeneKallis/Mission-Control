/**
 * GET /api/pi/sessions — list available Pi session files
 * POST /api/pi/sessions — set session name (body: { id, name })
 * DELETE /api/pi/sessions/[id] — delete a session directory
 *
 * Scans ~/.pi/agent/sessions/ for session directories and returns
 * metadata: id, name, lastModified, and messageCount (estimated from
 * session file size or metadata).
 */

import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync, existsSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";

// ── Constants ──────────────────────────────────────────────────────────────

const SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

export interface SessionEntry {
  id: string;
  name: string;
  lastModified: string; // ISO string
  messageCount: number;
  size: number; // bytes
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read session metadata from a session directory.
 * Pi stores sessions as directories with a session.jsonl file inside.
 */
function readSessionMeta(dirPath: string): SessionEntry | null {
  const id = basename(dirPath);
  if (id.startsWith(".") || id === "CVS") return null; // skip hidden

  const sessionFile = join(dirPath, "session.jsonl");
  if (!existsSync(sessionFile)) return null;

  try {
    const stat = statSync(sessionFile);
    const content = readFileSync(sessionFile, "utf-8");

    // Count non-empty lines as messages
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    // Try to read a name from the first metadata line, or a name.json file
    let name = id;
    const nameFile = join(dirPath, "name.txt");
    if (existsSync(nameFile)) {
      const customName = readFileSync(nameFile, "utf-8").trim();
      if (customName) name = customName;
    }

    return {
      id,
      name,
      lastModified: stat.mtime.toISOString(),
      messageCount: lines.length,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

/**
 * Scan the sessions directory and return all valid session entries,
 * sorted by lastModified (newest first).
 */
function listSessions(): SessionEntry[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const entries: SessionEntry[] = [];
  const dirs = readdirSync(SESSIONS_DIR, { withFileTypes: true });

  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const meta = readSessionMeta(join(SESSIONS_DIR, entry.name));
    if (meta) entries.push(meta);
  }

  // Sort newest first
  entries.sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
  );

  return entries;
}

// ── GET: List sessions ────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = listSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list sessions" },
      { status: 500 },
    );
  }
}

// ── POST: Set session name ────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { id?: string; name?: string };
    if (!body.id || !body.name?.trim()) {
      return NextResponse.json({ error: "Both 'id' and 'name' are required" }, { status: 400 });
    }

    // Sanitize: prevent path traversal
    const sessionId = basename(body.id);
    if (sessionId !== body.id) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    const sessionDir = join(SESSIONS_DIR, sessionId);
    if (!existsSync(sessionDir)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    writeFileSync(join(sessionDir, "name.txt"), body.name.trim(), "utf-8");

    return NextResponse.json({ ok: true, name: body.name.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update session" },
      { status: 500 },
    );
  }
}
