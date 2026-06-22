#!/usr/bin/env bun
/**
 * Radarr sync — delete 4K movies from Radarr4K that don't exist in main Radarr.
 *
 * Compares by TMDB id. Anything in Radarr4K whose TMDB id is missing from main
 * Radarr is a stray (we don't keep 4K copies of movies we don't have in 1080p).
 * Deletes with `deleteFiles=true` so the underlying files go too.
 *
 * Defaults to dry-run. Pass `--no-dry-run` to actually delete.
 *
 * Usage:
 *   just script scripts/arr/radarr-sync.ts                       # dry run
 *   just script scripts/arr/radarr-sync.ts -- --no-dry-run       # actually delete
 *   just script scripts/arr/radarr-sync.ts -- --dry-run=false    # equivalent
 *
 * Env:
 *   ARR__RADARR__API_KEY, ARR__RADARR4K__API_KEY (AppConfig)
 */

import { ArrClient } from "@/lib/clients/arr";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

const MAIN_NAME = "Radarr";
const TARGET_NAME = "Radarr4K";

async function main(argv?: string[]) {
  const args = parseArgs({ dryRun: { type: "boolean", default: true } }, argv);
  banner("Radarr 4K sync", { dryRun: args.dryRun });

  const config = getConfig();
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

  const mainMovies = await mainClient.listMovies().catch((err) => {
    error("Failed to list main Radarr movies", err);
    return [];
  });
  const targetMovies = await targetClient.listMovies().catch((err) => {
    error("Failed to list Radarr4K movies", err);
    return [];
  });

  const mainTmdb = new Set(mainMovies.map((m) => m.tmdbId).filter((id): id is number => id != null));
  info(`Main Radarr: ${mainMovies.length} movies, ${mainTmdb.size} have TMDB ids`);
  info(`Radarr4K:    ${targetMovies.length} movies`);

  const orphans = targetMovies.filter(
    (m) => m.tmdbId == null || !mainTmdb.has(m.tmdbId),
  );
  info(`Orphans to remove from ${TARGET_NAME}: ${orphans.length}`);

  let removed = 0;
  for (const m of orphans) {
    if (args.dryRun) {
      info(`  would delete: [${m.id}] ${m.title} (tmdb=${m.tmdbId ?? "n/a"})`);
      continue;
    }
    try {
      await targetClient.deleteMovie(m.id, true);
      removed++;
    } catch (err) {
      warn(`Failed to delete [${m.id}] ${m.title}: ${(err as Error).message}`);
    }
  }

  summary({
    "Orphans found:": orphans.length,
    "Deleted:": removed,
    "Mode:": args.dryRun ? "DRY RUN" : "LIVE",
  });
}

export { main };

if (import.meta.main) {
  main().catch((err) => {
    error("radarr-sync failed", err);
    process.exit(1);
  });
}
