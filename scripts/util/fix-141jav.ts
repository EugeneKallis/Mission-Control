#!/usr/bin/env bun
/**
 * fix-141jav — one-off DB migration setting source='141jav' on all
 * scrape rows where source is null or empty.
 *
 * The original Go script backfilled legacy rows that were inserted
 * before the `source` column existed. With the current schema, source
 * is non-nullable with a default of '141jav', so this script is a
 * safety check: it counts any nulls/empties and updates them if found.
 *
 * Running it against a healthy DB is a no-op. The script is kept
 * available because the historical migration may still be useful when
 * importing a legacy SQLite dump.
 *
 * Usage:
 *   just script scripts/util/fix-141jav.ts                    # dry-run (default)
 *   just script scripts/util/fix-141jav.ts -- --no-dry-run   # actually update
 *
 * Dry-run is the default (safe preview). Pass --no-dry-run to mutate.
 */

import { db } from "@/lib/db";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary } from "../_lib/log";

export async function main(argv?: string[]) {
  const args = parseArgs({ dryRun: { type: "boolean", default: true } }, argv);
  banner("fix-141jav", { dryRun: args.dryRun });

  // Wrap count + update + recount in a transaction so concurrent writers
  // can't insert new empty-source rows between operations.
  const { before, updated, after } = await db.$transaction(async (tx) => {
    const b = await tx.scrapedItem.count({ where: { source: "" } });

    if (args.dryRun) {
      return { before: b, updated: 0, after: b };
    }

    const result = await tx.scrapedItem.updateMany({
      where: { source: "" },
      data: { source: "141jav" },
    });
    const a = await tx.scrapedItem.count({ where: { source: "" } });
    return { before: b, updated: result.count, after: a };
  });

  info(`Scrape rows with empty source: ${before}`);

  if (args.dryRun) {
    info("Would update to source='141jav' (no changes made)");
    summary({
      "Before:": String(before),
      "Mode:": "DRY RUN",
    });
    return;
  }

  info(`Updated ${updated} row(s)`);
  summary({
    "Before:": String(before),
    "Updated:": String(updated),
    "After:": String(after),
  });
}

if (import.meta.main) {
  main()
    .catch((err) => {
      error("fix-141jav failed", err);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
