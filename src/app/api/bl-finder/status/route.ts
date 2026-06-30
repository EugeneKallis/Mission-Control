/**
 * GET /api/bl-finder/status
 * Returns the worker's last known status from the `settings` table.
 */
import { NextResponse } from "next/server";
import { getBlFinderStatus } from "@/lib/db/queries";

export async function GET() {
  try {
    const status = await getBlFinderStatus();
    return NextResponse.json(status);
  } catch (err) {
    console.error("GET /api/bl-finder/status failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
