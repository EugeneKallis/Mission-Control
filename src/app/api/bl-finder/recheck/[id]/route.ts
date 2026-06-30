/**
 * POST /api/bl-finder/recheck/[id]
 * Marks one row back to `pending` and runs the probe inline so the
 * caller gets the result without waiting for the worker's next tick.
 * The worker won't double-probe (pickFilesDueForCheck excludes
 * `checking`, and we'll mark checking→ok/broken ourselves).
 */
import { NextRequest, NextResponse } from "next/server";
import { probeFileReadable } from "@/lib/broken-link";
import {
  getFileCheck,
  markFileChecking,
  setFileCheckResult,
} from "@/lib/db/queries";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let row;
  try {
    row = await getFileCheck(id);
  } catch (err) {
    return NextResponse.json({ error: `Row not found: ${(err as Error).message}` }, { status: 404 });
  }

  try {
    await markFileChecking(id);
    const probe = await probeFileReadable(row.filePath);
    const updated = await setFileCheckResult(id, {
      ok: probe.ok,
      error: probe.error ?? null,
    });
    return NextResponse.json({ row: updated, probe });
  } catch (err) {
    console.error(`POST /api/bl-finder/recheck/${id} failed:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
