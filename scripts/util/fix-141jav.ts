#!/usr/bin/env bun
/**
 * fix-141jav — one-off DB migration setting `source='141jav'` on all
 * scrape rows where source is null.
 *
 * The original Go script backfilled legacy rows that were inserted
 * before the `source` column existed. With the current schema, `source`
 * is non-nullable with a default of `'141jav'`, so this script is a
 * safety check: it counts any nulls and updates them if found.
 *
 * Running it against a healthy DB is a no-op. The script is kept
 * available because the historical migration may still be useful when
 * importing a legacy SQLite dump.
 *
 * Usage:
 *   just script scripts/util/fix-141jav.ts
 *   just script scripts/util/fix-141jav.ts -- --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary } from "../_lib/log";

async function main() {
  const args = parseArgs({ dryRun: { type: "boolean", default: false } });
  banner("fix-141jav", { dryRun: args.dryRun });

  const prisma = new PrismaClient();
  try {
    // Run the count + (optional) update + recount inside a single
    // transaction so concurrent writers can't sneak rows in between our
    // `before` and `after` reads. The callback form lets us branch on
    // the dry-run flag without breaking the array-overload's
    // PrismaPromise types.
    const { before, after, updated } = await prisma.$transaction(async (tx) => {
      const beforeCount = await tx.scrapedItem.count({ where: { source: "" } });
      if (args.dryRun) {
        const afterCount = await tx.scrapedItem.count({ where: { source: "" } });
        return { before: beforeCount, after: afterCount, updated: { count: 0 } };
      }
      const result = await tx.scrapedItem.updateMany({
        where: { source: "" },
        data: { source: "141jav" },
      });
      const afterCount = await tx.scrapedItem.count({ where: { source: "" } });
      return { before: beforeCount, after: afterCount, updated: { count: result.count } };
    });
    info(`Scrape rows with empty source: ${before}`);

    if (args.dryRun) {
      info("Would update to source='141jav' (no changes made)");
      return;
    }

    info(`Updated ${updated.count} row(s)`);

    summary({
      "Before:": before,
      "Updated:": updated.count,
      "After:": after,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    error("fix-141jav failed", err);
    process.exit(1);
  });
}
