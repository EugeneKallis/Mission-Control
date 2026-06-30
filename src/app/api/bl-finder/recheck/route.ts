/**
 * POST /api/bl-finder/recheck
 * Body (optional): { mediaDir?: string }
 * Marks all (non-ignored) rows back to `pending` so the worker's next
 * tick picks them up. With no body, recheck everything.
 */
import { NextRequest, NextResponse } from "next/server";
import { markAllFilesRecheck } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  let body: { mediaDir?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const result = await markAllFilesRecheck({ mediaDir: body.mediaDir });
    return NextResponse.json({ updated: result.count, mediaDir: body.mediaDir ?? null });
  } catch (err) {
    console.error("POST /api/bl-finder/recheck failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
