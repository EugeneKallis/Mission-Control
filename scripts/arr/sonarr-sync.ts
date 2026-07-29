#!/usr/bin/env bun
/**
 * Sonarr sync — delete 4K series from Sonarr4K that don't exist in main Sonarr.
 *
 * Compares by TVDB id. Anything in Sonarr4K whose TVDB id is missing from main
 * Sonarr is a stray. Deletes with `deleteFiles=true`.
 *
 * Defaults to dry-run. Pass `--run` to actually delete.
 *
 * Usage:
 *   just script scripts/arr/sonarr-sync.ts                       # dry run
 *   just script scripts/arr/sonarr-sync.ts -- --run       # actually delete
 *
 * Configuration:
 *   - Arr instances are resolved via resolveConfig() from @/lib/config.
 *   - Precedence: environment variable > Config page (website DB) > built-in default.
 *   - Set per-instance API keys via ARR__<NAME>__API_KEY or the Config page at /admin/config.
 *   - Set per-instance URLs via ARR__<NAME>__URL or the Config page.
 */

import { ArrClient } from "@/lib/clients/arr";
import { resolveConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

const MAIN_NAME = "Sonarr";
const TARGET_NAME = "Sonarr4K";

async function main(argv?: string[]) {
  const args = parseArgs({ run: { type: "boolean", default: false } }, argv);
  const dryRun = !args.run;
  banner("Sonarr 4K sync", { dryRun });

  const config = await resolveConfig();
  const main = config.arrInstances.find((i) => i.name === MAIN_NAME);
  const target = config.arrInstances.find((i) => i.name === TARGET_NAME);

  if (!main || !target) {
    error(`Need both ${MAIN_NAME} and ${TARGET_NAME} configured`);
    process.exit(1);
  }
  if (!main.apiKey || !target.apiKey) {
    error(`Missing API key for ${!main.apiKey ? MAIN_NAME : TARGET_NAME}`);
    process.exit(1);
  }

  const mainClient = new ArrClient(main);
  const targetClient = new ArrClient(target);

  const mainSeries = await mainClient.listSeries().catch((err) => {
    error("Failed to list main Sonarr series", err);
    return [];
  });
  const targetSeries = await targetClient.listSeries().catch((err) => {
    error("Failed to list Sonarr4K series", err);
    return [];
  });

  const mainTvdb = new Set(
    mainSeries.map((s) => s.tvdbId).filter((id): id is number => id != null),
  );
  info(`Main Sonarr: ${mainSeries.length} series, ${mainTvdb.size} have TVDB ids`);
  info(`Sonarr4K:    ${targetSeries.length} series`);

  const orphans = targetSeries.filter(
    (s) => s.tvdbId == null || !mainTvdb.has(s.tvdbId),
  );
  info(`Orphans to remove from ${TARGET_NAME}: ${orphans.length}`);

  let removed = 0;
  for (const s of orphans) {
    if (dryRun) {
      info(`  would delete: [${s.id}] ${s.title} (tvdb=${s.tvdbId ?? "n/a"})`);
      continue;
    }
    try {
      await targetClient.deleteSeries(s.id, true);
      removed++;
    } catch (err) {
      warn(`Failed to delete [${s.id}] ${s.title}: ${(err as Error).message}`);
    }
  }

  summary({
    "Orphans found:": orphans.length,
    "Deleted:": removed,
    "Mode:": dryRun ? "DRY RUN" : "LIVE",
  });
}

export { main };

if (import.meta.main) {
  main().catch((err) => {
    error("sonarr-sync failed", err);
    process.exit(1);
  });
}
