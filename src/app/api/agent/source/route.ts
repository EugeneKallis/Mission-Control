/**
 * GET /api/agent/source
 *
 * Serves the bundled TypeScript agent source so the install script can
 * pull it down and run it with `bun`. The agent opens an SSE stream
 * to receive commands and POSTs heartbeats to /api/agent/heartbeat.
 */

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const path = join(process.cwd(), "src/workers/agent.ts");
  try {
    const source = readFileSync(path, "utf-8");
    return new NextResponse(source, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return new NextResponse(
      `// agent source not found at ${path}: ${err instanceof Error ? err.message : String(err)}\n`,
      { status: 404, headers: { "Content-Type": "text/plain" } }
    );
  }
}
