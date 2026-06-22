/**
 * POST /api/migrate/run
 *
 * Copies the selected tables from a user-supplied ServerTool
 * SQLite database into the Mission Control DB. Idempotent: rows
 * that already exist (matched on the natural key) are skipped.
 *
 * Body: {
 *   dbPath: string,
 *   tables: {
 *     macroGroups: boolean,
 *     macros: boolean,
 *     scrapeResults: boolean,
 *     scrapedItems: boolean,
 *     scrapedItemFiles: boolean,
 *   }
 * }
 *
 * Response: { dbPath, result: { macroGroups: TableStats, ... } }
 *
 * Errors:
 *   400 - invalid path / not a SQLite file / no tables selected
 *   500 - unexpected error
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applySnapshot,
  readSourceSnapshot,
  resolveSourcePath,
  SourceDbError,
} from "@/lib/migrate";

const tableFlagsSchema = z.object({
  macroGroups: z.boolean().optional().default(false),
  macros: z.boolean().optional().default(false),
  scrapeResults: z.boolean().optional().default(false),
  scrapedItems: z.boolean().optional().default(false),
  scrapedItemFiles: z.boolean().optional().default(false),
});

const schema = z.object({
  dbPath: z.string().min(1, "dbPath is required"),
  tables: tableFlagsSchema,
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

  const { dbPath, tables } = parsed.data;

  // At least one table must be selected.
  if (
    !tables.macroGroups &&
    !tables.macros &&
    !tables.scrapeResults &&
    !tables.scrapedItems &&
    !tables.scrapedItemFiles
  ) {
    return NextResponse.json(
      { error: "Select at least one table to migrate" },
      { status: 400 },
    );
  }

  // Resolve the path first (cheap) so we can return a clean 400 for
  // bad paths without ever opening the source DB.
  let absolutePath: string;
  try {
    const resolved = await resolveSourcePath(dbPath);
    absolutePath = resolved.absolutePath;
  } catch (err) {
    if (err instanceof SourceDbError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  try {
    const snapshot = await readSourceSnapshot(absolutePath);
    const result = await applySnapshot(db, snapshot, {
      macroGroups: tables.macroGroups ?? false,
      macros: tables.macros ?? false,
      scrapeResults: tables.scrapeResults ?? false,
      scrapedItems: tables.scrapedItems ?? false,
      scrapedItemFiles: tables.scrapedItemFiles ?? false,
    });
    return NextResponse.json({ dbPath: absolutePath, result });
  } catch (err) {
    if (err instanceof SourceDbError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to run migration:", err);
    return NextResponse.json(
      { error: "Failed to run migration" },
      { status: 500 },
    );
  }
}
