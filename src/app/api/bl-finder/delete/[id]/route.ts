/**
 * POST /api/bl-finder/delete/[id]
 * Deletes the broken symlink on disk and the FileCheck row.
 *
 * Safety: only acts when:
 *   1. the row exists,
 *   2. the row's status is `broken` (so a healthy file is never
 *      rm'd from under the user),
 *   3. the path on disk is still a symlink (re-`lstat` to be sure —
 *      a TOCTOU race between listing and clicking delete is unlikely
 *      but cheap to guard against),
 *   4. the symlink target is not playable (re-`probeFileReadable` —
 *      a file whose container header is intact but whose stream
 *      body is corrupt or whose mount returns headers but not bytes
 *      is treated as broken, so the user can clean it up).
 * We rm only the symlink path (never the target).
 */
import { NextRequest, NextResponse } from "next/server";
import { lstat, rm } from "fs/promises";
import {
  deleteFileCheckRow,
  getFileCheck,
} from "@/lib/db/queries";
import { probeFileReadable } from "@/lib/broken-link";

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

  if (row.status !== "broken") {
    return NextResponse.json(
      { error: `Refusing to delete: row status is '${row.status}', not 'broken'` },
      { status: 409 },
    );
  }

  // Re-verify on disk before the destructive op.
  try {
    const st = await lstat(row.filePath);
    if (!st.isSymbolicLink()) {
      return NextResponse.json(
        { error: "Path is not a symlink; refusing to delete" },
        { status: 409 },
      );
    }
    // Probe the target with ffprobe — if it returns packets, the
    // file is playable and we should NOT delete. If it fails (target
    // missing, corrupt, mount returns headers but not bytes), proceed.
    const probe = await probeFileReadable(row.filePath, 10);
    if (probe.ok) {
      return NextResponse.json(
        { error: `Symlink target is playable (${probe.packets} packets); refusing to delete` },
        { status: 409 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Safety check failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  try {
    await rm(row.filePath, { force: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to remove symlink: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  try {
    await deleteFileCheckRow(id);
  } catch (err) {
    // Symlink is gone but row remains — log and continue.
    console.error(`Deleted symlink ${row.filePath} but failed to delete row ${id}: ${(err as Error).message}`);
    return NextResponse.json({
      deleted_symlink: row.filePath,
      row_remaining: true,
    });
  }

  return NextResponse.json({ id, filePath: row.filePath, deleted: true });
}
