/**
 * GET /api/bl-finder/log — return the last N worker log entries (newest first).
 */
import { NextRequest, NextResponse } from "next/server";
import { getBlFinderLog } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const n = Math.min(
    parseInt(request.nextUrl.searchParams.get("n") ?? "100", 10) || 100,
    500,
  );
  try {
    const entries = await getBlFinderLog(n);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("GET /api/bl-finder/log failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
