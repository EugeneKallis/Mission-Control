/**
 * POST /api/bl-finder/delete-all
 * Bulk-delete ALL broken symlinks.
 *
 * For every non-ignored row with status `broken`, applies the same
 * safety checks as the individual delete endpoint:
 *   1. the path must still be a symlink (lstat),
 *   2. the symlink target must not be playable (probeFileReadable —
 *      a file whose container header is intact but whose stream body
 *      is corrupt is still treated as broken, so the user can clean
 *      it up).
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
import { lstat, rm } from "fs/promises";
import {
  deleteFileCheckRow,
  listBrokenFileChecks,
} from "@/lib/db/queries";
import { probeFileReadable } from "@/lib/broken-link";

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
        const msg = "Not a symlink — refusing to delete";
        console.error(`[bl-finder:delete-all] row ${row.id} ${row.filePath}: ${msg}`);
        results.push({ id: row.id, filePath: row.filePath, deleted: false, error: msg });
        continue;
      }

      // Probe with ffprobe — if the target returns packets, it's
      // playable and we refuse. If it fails (missing, corrupt,
      // mount returns headers but not bytes), proceed to delete.
      const probe = await probeFileReadable(row.filePath, 10);
      if (probe.ok) {
        const msg = `Symlink target is playable (${probe.packets} packets); refusing to delete`;
        console.error(`[bl-finder:delete-all] row ${row.id} ${row.filePath}: ${msg}`);
        results.push({ id: row.id, filePath: row.filePath, deleted: false, error: msg });
        continue;
      }
    } catch (err) {
      const msg = `Safety check failed: ${(err as Error).message}`;
      console.error(`[bl-finder:delete-all] row ${row.id} ${row.filePath}: ${msg}`);
      results.push({ id: row.id, filePath: row.filePath, deleted: false, error: msg });
      continue;
    }

    // ── Delete the symlink and the row ───────────────────────
    try {
      await rm(row.filePath, { force: true });
    } catch (err) {
      const msg = `Failed to remove symlink: ${(err as Error).message}`;
      console.error(`[bl-finder:delete-all] row ${row.id} ${row.filePath}: ${msg}`);
      results.push({ id: row.id, filePath: row.filePath, deleted: false, error: msg });
      continue;
    }

    try {
      await deleteFileCheckRow(row.id);
    } catch (err) {
      const msg = `Symlink removed but DB row ${row.id} may remain: ${(err as Error).message}`;
      console.error(`[bl-finder:delete-all] ${msg}`);
      results.push({ id: row.id, filePath: row.filePath, deleted: true, error: msg });
      continue;
    }

    results.push({ id: row.id, filePath: row.filePath, deleted: true });
  }

  const deleted = results.filter((r) => r.deleted).length;
  const failed = results.filter((r) => !r.deleted).length;
  console.error(
    `[bl-finder:delete-all] done: ${deleted}/${rows.length} deleted, ${failed} failed`,
  );

  return NextResponse.json({
    deleted: results.filter((r) => r.deleted).length,
    total: rows.length,
    results,
  });
}
