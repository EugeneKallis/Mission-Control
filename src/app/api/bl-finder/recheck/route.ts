/**
 * POST /api/bl-finder/recheck
 * Body (optional): { status?: string, mediaDir?: string, search?: string }
 * Marks matching non-ignored rows back to `pending` and wakes the worker
 * so it picks them up promptly. With no filters, recheck everything.
 */
import { NextRequest, NextResponse } from "next/server";
import { markAllFilesRecheck, setBlFinderStatus } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  let body: { status?: string; mediaDir?: string; search?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const result = await markAllFilesRecheck(body);
    if (result.count > 0) {
      // Wake the long-running checker promptly instead of waiting for its
      // normal interval (usually 60s) before it notices the queued rows.
      await setBlFinderStatus({
        lastPassAt: null,
        forceWakeAt: Date.now() + 5_000,
      });
    }
    return NextResponse.json({ updated: result.count, mediaDir: body.mediaDir ?? null });
  } catch (err) {
    console.error("POST /api/bl-finder/recheck failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
