/**
 * GET /api/bl-finder
 * Query params:
 *   status      — pending | checking | ok | broken
 *   mediaDir    — top-level media dir name (e.g. "movies")
 *   search      — substring match against file_path
 *   limit       — default 100, max 500
 *   offset      — default 0
 *
 * Returns:
 *   { rows: FileCheckRow[], total: number, counts: { [status]: number } }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  countFileChecks,
  listFileChecks,
} from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? undefined;
  const mediaDir = params.get("mediaDir") ?? undefined;
  const search = params.get("search") ?? undefined;
  const limit = Math.min(parseInt(params.get("limit") ?? "100", 10) || 100, 500);
  const offset = parseInt(params.get("offset") ?? "0", 10) || 0;

  try {
    const [rows, total, counts] = await Promise.all([
      listFileChecks({ status, mediaDir, search, limit, offset }),
      countFileChecks({ status, mediaDir, search }),
      // Aggregate counts per status for the page header (all rows, no
      // filter). We do this with a single groupBy so the page can show
      // "5 broken / 120 ok / 30 pending" without 4 separate count calls.
      db.fileCheck.groupBy({
        by: ["status"],
        where: { isIgnored: false },
        _count: { _all: true },
      }),
    ]);

    const countsMap: Record<string, number> = {};
    for (const c of counts) countsMap[c.status] = c._count._all;

    return NextResponse.json({ rows, total, counts: countsMap });
  } catch (err) {
    console.error("GET /api/bl-finder failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
