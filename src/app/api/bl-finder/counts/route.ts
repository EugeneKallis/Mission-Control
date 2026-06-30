/**
 * GET /api/bl-finder/counts
 *
 * Lightweight per-status counts of non-ignored FileCheck rows.
 * Returns:
 *   { broken, ok, pending, checking, total }
 *
 * Backed by a single `db.fileCheck.groupBy` so it's cheap to poll
 * (the sidebar nav badge re-fetches on a 60s interval + on tab
 * visibilitychange).
 *
 * Ignored rows are excluded from every count, including `total` —
 * `total` is the sum of the per-status counts, not a row count of
 * the table.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const KNOWN_STATUSES = ["broken", "ok", "pending", "checking"] as const;
type Status = (typeof KNOWN_STATUSES)[number];

export interface BlFinderCounts {
  broken: number;
  ok: number;
  pending: number;
  checking: number;
  total: number;
}

export async function GET(): Promise<NextResponse<BlFinderCounts>> {
  const grouped = await db.fileCheck.groupBy({
    by: ["status"],
    where: { isIgnored: false },
    _count: { _all: true },
  });

  const counts: Record<Status, number> = {
    broken: 0,
    ok: 0,
    pending: 0,
    checking: 0,
  };
  for (const row of grouped) {
    if (KNOWN_STATUSES.includes(row.status as Status)) {
      counts[row.status as Status] = row._count._all;
    }
  }

  return NextResponse.json({
    broken: counts.broken,
    ok: counts.ok,
    pending: counts.pending,
    checking: counts.checking,
    total: counts.broken + counts.ok + counts.pending + counts.checking,
  });
}
