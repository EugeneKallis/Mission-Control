/**
 * POST /api/bl-finder/trigger-scan
 * Marks all non-ignored rows back to `pending` and wakes the worker
 * through the status row. The worker checks that hint while waiting
 * between passes, so it starts within about one second instead of
 * waiting for the configured interval.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  markAllFilesRecheck,
  setBlFinderStatus,
} from "@/lib/db/queries";

export async function POST(_request: NextRequest) {
  try {
    const result = await markAllFilesRecheck();
    await setBlFinderStatus({
      lastPassAt: null,
      // Signal the worker to wake up and discover immediately on its next tick.
      forceWakeAt: Date.now() + 5000,
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error("POST /api/bl-finder/trigger-scan failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
