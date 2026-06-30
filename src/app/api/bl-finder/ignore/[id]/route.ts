/**
 * POST /api/bl-finder/ignore/[id]
 * Toggles `is_ignored` on a row. Ignored rows are hidden from the
 * default list and skipped by the worker.
 */
import { NextRequest, NextResponse } from "next/server";
import { toggleFileCheckIgnore } from "@/lib/db/queries";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const row = await toggleFileCheckIgnore(id);
    return NextResponse.json({ id, isIgnored: row.isIgnored });
  } catch (err) {
    console.error(`POST /api/bl-finder/ignore/${id} failed:`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
