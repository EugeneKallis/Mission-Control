#!/usr/bin/env bun
/**
 * Arr searcher — trigger missing-content searches across the Arr stack
 * in priority order.
 *
 * For Radarr, scans for movies where `status==released && !hasFile && monitored`
 * and triggers `MoviesSearch` on each. For Sonarr, paginates
 * `/api/v3/wanted/missing` (50/page) and triggers `EpisodeSearch`.
 *
 * Priority order is main → variant (Radarr → RadarrKids → Radarr4K, same for
 * Sonarr). Each instance is capped at `--limit` triggers per run so a backlog
 * doesn't get hammered all at once.
 *
 * Usage:
 *   just script scripts/arr/arr-searcher.ts                 # default 50/instance
 *   just script scripts/arr/arr-searcher.ts -- --limit 20
 *   just script scripts/arr/arr-searcher.ts -- --dry-run    # log only
 *   just script scripts/arr/arr-searcher.ts -- --radarr-only
 *
 * Env:
 *   ARR__<NAME>__API_KEY for any instance not already in AppConfig.
 */

import { ArrClient } from "@/lib/clients/arr";
import { getConfig } from "@/lib/config";
import { chunk, sortByPriority } from "../_lib/collections";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";
import type { ArrInstance } from "@/types";

const RADARR_PRIORITY = ["Radarr", "RadarrKids", "Radarr4K", "RadarrAnime", "RadarrLocal"];
const SONARR_PRIORITY = ["Sonarr", "SonarrKids", "Sonarr4K", "SonarrAnime", "SonarrLocal"];

export async function main(argv?: string[]) {
  const args = parseArgs(
    {
      dryRun: { type: "boolean", default: false },
      limit: { type: "number", default: 50 },
      radarrOnly: { type: "boolean", default: false },
      sonarrOnly: { type: "boolean", default: false },
    },
    argv,
  );

  banner("Arr searcher", { dryRun: args.dryRun });

  const config = getConfig();
  const radarr = sortByPriority(config.arrInstances.filter((i) => i.type === "radarr"), RADARR_PRIORITY);
  const sonarr = sortByPriority(config.arrInstances.filter((i) => i.type === "sonarr"), SONARR_PRIORITY);

  let totalTriggered = 0;
  let totalSkipped = 0;

  if (!args.sonarrOnly) {
    for (const inst of radarr) {
      const result = await searchRadarr(inst, args.limit, args.dryRun);
      totalTriggered += result.triggered;
      totalSkipped += result.skipped;
    }
  }

  if (!args.radarrOnly) {
    for (const inst of sonarr) {
      const result = await searchSonarr(inst, args.limit, args.dryRun);
      totalTriggered += result.triggered;
      totalSkipped += result.skipped;
    }
  }

  summary({
    "Triggered:": totalTriggered,
    "Skipped (already triggered / filtered):": totalSkipped,
    "Mode:": args.dryRun ? "DRY RUN" : "LIVE",
  });
}

async function searchRadarr(
  instance: ArrInstance,
  limit: number,
  dryRun: boolean,
): Promise<{ triggered: number; skipped: number }> {
  if (!instance.apiKey) {
    warn(`[${instance.name}] no API key configured, skipping`);
    return { triggered: 0, skipped: 0 };
  }

  banner(`Radarr · ${instance.name}`);
  const client = new ArrClient(instance);
  const all = await client.listMovies().catch((err) => {
    error(`[${instance.name}] failed to list movies`, err);
    return [];
  });

  const missing = all.filter(
    (m) => m.status === "released" && !m.hasFile && m.monitored,
  );
  info(`[${instance.name}] ${missing.length} missing movies (capped at ${limit})`);

  const targets = missing.slice(0, limit);
  if (dryRun) {
    for (const m of targets) info(`  would search: [${m.id}] ${m.title}`);
    return { triggered: 0, skipped: missing.length - targets.length };
  }

  let triggered = 0;
  for (const m of targets) {
    try {
      await client.triggerMovieSearch([m.id]);
      triggered++;
    } catch (err) {
      warn(`[${instance.name}] failed to search [${m.id}] ${m.title}: ${(err as Error).message}`);
    }
  }
  info(`[${instance.name}] triggered ${triggered} search(es)`);
  return { triggered, skipped: missing.length - targets.length };
}

async function searchSonarr(
  instance: ArrInstance,
  limit: number,
  dryRun: boolean,
): Promise<{ triggered: number; skipped: number }> {
  if (!instance.apiKey) {
    warn(`[${instance.name}] no API key configured, skipping`);
    return { triggered: 0, skipped: 0 };
  }

  banner(`Sonarr · ${instance.name}`);
  const client = new ArrClient(instance);
  const pageSize = 50;
  let page = 1;
  let total = Infinity;
  const collected: number[] = [];
  let totalMissing = 0;

  while (collected.length < limit && (page - 1) * pageSize < total) {
    const { records, totalRecords } = await client.getWantedMissing(page, pageSize).catch((err) => {
      error(`[${instance.name}] wanted/missing failed on page ${page}`, err);
      return { records: [], totalRecords: 0 };
    });
    total = totalRecords;
    totalMissing = totalRecords;
    for (const ep of records) collected.push(ep.id);
    page++;
    if (records.length < pageSize) break;
  }

  info(`[${instance.name}] ${totalMissing} missing episodes (will trigger up to ${limit})`);

  const targets = collected.slice(0, limit);
  if (dryRun) {
    for (const id of targets) info(`  would search: episode ${id}`);
    return { triggered: 0, skipped: totalMissing - targets.length };
  }

  // Batch to one EpisodeSearch call per group of 50 episode ids.
  const batches = chunk(targets, 50);
  let triggered = 0;
  for (const batch of batches) {
    try {
      await client.triggerEpisodeSearch(batch);
      triggered += batch.length;
    } catch (err) {
      warn(`[${instance.name}] episode search batch failed: ${(err as Error).message}`);
    }
  }
  info(`[${instance.name}] triggered ${triggered} episode search(es)`);
  return { triggered, skipped: totalMissing - targets.length };
}

// ── Module entry-point guard ───────────────────────────────────────────────
// Only run when invoked as the main module (not when imported by tests).
if (import.meta.main) {
  main().catch((err) => {
    error("Arr searcher failed", err);
    process.exit(1);
  });
}
