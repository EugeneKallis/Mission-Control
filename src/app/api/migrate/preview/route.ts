/**
 * POST /api/migrate/preview
 *
 * Probes a user-supplied ServerTool SQLite database and returns
 * which tables are present and how many rows they contain. The
 * source DB is opened read-only and never modified.
 *
 * Body: { dbPath: string }
 * Response: { dbPath, dbSizeBytes, present: { ... }, counts: { ... }, isSqlite: true }
 *
 * Errors:
 *   400 - invalid path / not a SQLite file
 *   500 - unexpected error
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewSource, SourceDbError } from "@/lib/migrate";

const schema = z.object({
  dbPath: z.string().min(1, "dbPath is required"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const info = await previewSource(parsed.data.dbPath);
    return NextResponse.json(info);
  } catch (err) {
    if (err instanceof SourceDbError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to preview source DB:", err);
    return NextResponse.json(
      { error: "Failed to preview source database" },
      { status: 500 },
    );
  }
}
