#!/usr/bin/env bun
/**
 * Repair HTML-escaped ProjectJAV magnets and their deduplication keys.
 *
 * Usage (run from the deployment directory to repair the production DB):
 *   bun run scripts/util/fix-projectjav-magnets.ts          # dry-run
 *   bun run scripts/util/fix-projectjav-magnets.ts --run    # repair
 *
 * Preserves IDs, timestamps, hidden/downloaded flags, and other sources.
 * The single UPDATE is atomic: a unique-key collision fails without changing
 * any rows. Do not clear/rescrape the source to repair these links.
 */
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { parseArgs } from "../_lib/cli";
import { banner, error, summary } from "../_lib/log";

export async function repairProjectJAVMagnets(client: PrismaClient, run = false): Promise<number> {
  if (!run) {
    return client.scrapeResult.count({
      where: {
        source: "projectjav",
        OR: [
          { magnetLink: { contains: "&amp;" } },
          { uniqueKey: { contains: "&amp;" } },
        ],
      },
    });
  }

  return client.$executeRaw`
    UPDATE scrape_results
    SET magnet_link = REPLACE(magnet_link, '&amp;', '&'),
        unique_key = REPLACE(unique_key, '&amp;', '&')
    WHERE source = 'projectjav'
      AND (INSTR(magnet_link, '&amp;') > 0 OR INSTR(unique_key, '&amp;') > 0)
  `;
}

export async function main(argv?: string[]) {
  const args = parseArgs({ run: { type: "boolean", default: false } }, argv);
  banner("fix-projectjav-magnets", { dryRun: !args.run });
  const count = await repairProjectJAVMagnets(db, args.run);
  summary({ "Mode:": args.run ? "LIVE" : "DRY RUN", "Rows:": count });
}

if (import.meta.main) {
  main().catch((err) => {
    error("ProjectJAV magnet repair failed; no rows changed", err);
    process.exitCode = 1;
  }).finally(() => db.$disconnect());
}
