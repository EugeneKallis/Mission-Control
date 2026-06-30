/**
 * POST /api/bl-finder/trigger-scan
 * Marks all non-ignored rows back to `pending` and (best-effort) wakes
 * the worker by flipping a "forceDiscover" hint in the status row.
 *
 * The worker reads its config + status every tick; it doesn't poll a
 * "wake now" signal. Setting `running=false` and `lastPassAt=null`
 * is enough — the worker picks up pending rows on its next tick
 * (within `intervalSec`). For an immediate effect, the user can also
 * lower the interval to 1s before triggering.
 *
 * In the future this could signal the worker via a Redis pub/sub or
 * a UNIX socket, but for now a config reload is the contract.
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
      forceWakeAt: Date.now() + 1000,
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    console.error("POST /api/bl-finder/trigger-scan failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
