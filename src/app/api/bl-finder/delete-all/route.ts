/**
 * POST /api/bl-finder/delete-all
 * Bulk-delete ALL broken symlinks.
 *
 * For every non-ignored row with status `broken`, applies the same
 * safety checks as the individual delete endpoint:
 *   1. the path must still be a symlink (lstat),
 *   2. the symlink target must be unreachable (stat throws).
 *
 * Skips ignored rows. Optionally filters by mediaDir.
 *
 * Returns a summary: { deleted, total, results[] } where each result
 * has { id, filePath, deleted, error? }.
 *
 * A single row failure does not abort the whole batch — the response
 * lists every row's outcome so the user can see which ones failed and
 * why.
 */
import { NextRequest, NextResponse } from "next/server";
import { lstat, rm, stat } from "fs/promises";
import {
  deleteFileCheckRow,
  listBrokenFileChecks,
} from "@/lib/db/queries";

interface DeleteResult {
  id: number;
  filePath: string;
  deleted: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mediaDir?: string;
  };
  const mediaDir = body.mediaDir || undefined;

  let rows;
  try {
    rows = await listBrokenFileChecks({ mediaDir });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to query broken files: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ deleted: 0, total: 0, results: [] as DeleteResult[] });
  }

  const results: DeleteResult[] = [];

  for (const row of rows) {
    // ── Safety checks (same as individual delete) ────────────
    try {
      const st = await lstat(row.filePath);
      if (!st.isSymbolicLink()) {
        results.push({
          id: row.id,
          filePath: row.filePath,
          deleted: false,
          error: "Not a symlink",
        });
        continue;
      }

      // If stat(follow) succeeds, the target is reachable — refuse.
      await stat(row.filePath);
      results.push({
        id: row.id,
        filePath: row.filePath,
        deleted: false,
        error: "Symlink target is reachable (may have recovered)",
      });
      continue;
    } catch (err) {
      if (!(err as NodeJS.ErrnoException).code) {
        // Some unexpected error (not a filesystem ENOENT/ENOTDIR etc.)
        results.push({
          id: row.id,
          filePath: row.filePath,
          deleted: false,
          error: `Safety check failed: ${(err as Error).message}`,
        });
        continue;
      }
      // Expected: lstat succeeded (it's a symlink) but stat(follow)
      // threw (target missing). Proceed.
    }

    // ── Delete the symlink and the row ───────────────────────
    try {
      await rm(row.filePath, { force: true });
    } catch (err) {
      results.push({
        id: row.id,
        filePath: row.filePath,
        deleted: false,
        error: `Failed to remove symlink: ${(err as Error).message}`,
      });
      continue;
    }

    try {
      await deleteFileCheckRow(row.id);
    } catch (err) {
      console.error(
        `Deleted symlink ${row.filePath} but failed to delete row ${row.id}: ${(err as Error).message}`,
      );
      results.push({
        id: row.id,
        filePath: row.filePath,
        deleted: true,
        error: `Symlink removed but row may remain: ${(err as Error).message}`,
      });
      continue;
    }

    results.push({ id: row.id, filePath: row.filePath, deleted: true });
  }

  return NextResponse.json({
    deleted: results.filter((r) => r.deleted).length,
    total: rows.length,
    results,
  });
}
