#!/usr/bin/env bun
/**
 * Arr searcher — trigger missing-content searches across the Arr stack
 * in priority order.
 *
 * Before searching, paginates each Arr queue. Completed, `importBlocked` items
 * that entered the queue at least one hour ago are removed from the download client
 * and blocklisted; Arr is allowed to find a replacement automatically.
 * Media already represented in the queue is excluded from the normal search pass.
 *
 * For Radarr, scans for movies where `status==released && !hasFile && monitored`
 * and triggers `MoviesSearch` on each. For Sonarr, paginates
 * `/api/v3/wanted/missing` (50/page) and triggers `EpisodeSearch`.
 *
 * Priority order is main → variant (Radarr → RadarrKids → Radarr4K → RadarrAnime,
 * same for Sonarr). Each instance is capped at `--limit` triggers per run so a backlog
 * doesn't get hammered all at once.
 *
 * Dry-run is the default (safe preview). Pass --run to actually trigger
 * searches.
 *
 * Usage:
 *   just script scripts/arr/arr-searcher.ts                 # dry-run (default 50/instance)
 *   just script scripts/arr/arr-searcher.ts -- --limit 20
 *   just script scripts/arr/arr-searcher.ts -- --run        # actually trigger
 *   just script scripts/arr/arr-searcher.ts -- --radarr-only
 *
 * Configuration:
 *   - Arr instances are resolved via resolveConfig() from @/lib/config.
 *   - Precedence: environment variable > Config page (website DB) > built-in default.
 *   - Set per-instance API keys via ARR__<NAME>__API_KEY or the Config page at /admin/config.
 *   - Set per-instance URLs via ARR__<NAME>__URL or the Config page.
 */

import { ArrClient, type ArrEpisodeResponse, type ArrQueueItem } from "@/lib/clients/arr";
import { resolveConfig } from "@/lib/config";
import { chunk, sortByPriority } from "../_lib/collections";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";
import type { ArrInstance } from "@/types";

const RADARR_PRIORITY = ["Radarr", "RadarrKids", "Radarr4K", "RadarrAnime", "RadarrLocal"];
const SONARR_PRIORITY = ["Sonarr", "SonarrKids", "Sonarr4K", "SonarrAnime", "SonarrLocal"];
const STALE_IMPORT_MS = 60 * 60 * 1000;

export function isStaleBlockedImport(item: ArrQueueItem, now = Date.now()): boolean {
  const added = Date.parse(item.added ?? "");
  return (
    item.status?.toLowerCase() === "completed" &&
    item.trackedDownloadState?.toLowerCase() === "importblocked" &&
    Number.isFinite(added) &&
    now - added >= STALE_IMPORT_MS
  );
}

export async function main(argv?: string[]) {
  const args = parseArgs(
    {
      run: { type: "boolean", default: false },
      limit: { type: "number", default: 50 },
      radarrOnly: { type: "boolean", default: false },
      sonarrOnly: { type: "boolean", default: false },
    },
    argv,
  );
  const dryRun = !args.run;

  banner("Arr searcher", { dryRun });

  const config = await resolveConfig();
  const radarr = sortByPriority(config.arrInstances.filter((i) => i.type === "radarr"), RADARR_PRIORITY);
  const sonarr = sortByPriority(config.arrInstances.filter((i) => i.type === "sonarr"), SONARR_PRIORITY);

  let totalTriggered = 0;
  let totalSkipped = 0;
  let totalStaleImports = 0;

  if (!args.sonarrOnly) {
    for (const inst of radarr) {
      const result = await searchRadarr(inst, args.limit, dryRun);
      totalTriggered += result.triggered;
      totalSkipped += result.skipped;
      totalStaleImports += result.staleImports;
    }
  }

  if (!args.radarrOnly) {
    for (const inst of sonarr) {
      const result = await searchSonarr(inst, args.limit, dryRun);
      totalTriggered += result.triggered;
      totalSkipped += result.skipped;
      totalStaleImports += result.staleImports;
    }
  }

  summary({
    "Triggered:": totalTriggered,
    "Skipped (queued / filtered):": totalSkipped,
    "Stuck imports:": dryRun ? `${totalStaleImports} would clear` : `${totalStaleImports} cleared`,
    "Mode:": dryRun ? "DRY RUN" : "LIVE",
  });
}

interface QueueMaintenanceResult {
  movieIds: Set<number>;
  episodeIds: Set<number>;
  staleImports: number;
}

async function maintainQueue(
  instance: ArrInstance,
  client: ArrClient,
  dryRun: boolean,
): Promise<QueueMaintenanceResult> {
  const items: ArrQueueItem[] = [];
  const pageSize = 100;
  let page = 1;
  let total = Infinity;

  try {
    while (items.length < total) {
      const result = await client.getQueue(page, pageSize);
      items.push(...result.records);
      total = result.totalRecords;
      if (result.records.length < pageSize) break;
      page++;
    }
  } catch (err) {
    error(`[${instance.name}] failed to inspect queue`, err);
    return { movieIds: new Set(), episodeIds: new Set(), staleImports: 0 };
  }

  const movieIds = new Set(items.flatMap((item) => item.movieId == null ? [] : [item.movieId]));
  const episodeIds = new Set(items.flatMap((item) => item.episodeId == null ? [] : [item.episodeId]));
  const handledIds = new Set<number>();
  let staleImports = 0;

  for (const item of items) {
    if (!isStaleBlockedImport(item) || handledIds.has(item.id)) continue;
    handledIds.add(item.id);

    const ageMinutes = Math.floor((Date.now() - Date.parse(item.added!)) / 60_000);
    const reason = item.errorMessage ?? item.statusMessages?.flatMap((message) => message.messages ?? []).join("; ");
    const detail = `[queue ${item.id}] ${item.title} (${ageMinutes}m)${reason ? ` — ${reason}` : ""}`;

    if (dryRun) {
      info(`  would delete + blocklist stuck import: ${detail}`);
      staleImports++;
      continue;
    }

    info(`  deleting + blocklisting stuck import: ${detail}`);
    try {
      await client.removeQueueItem(item.id);
      staleImports++;
      info(`  deleted + blocklisted: ${detail}; Arr replacement search requested`);
    } catch (err) {
      warn(`[${instance.name}] failed to clear queue item [${item.id}] ${item.title}: ${(err as Error).message}`);
    }
  }

  return { movieIds, episodeIds, staleImports };
}

async function searchRadarr(
  instance: ArrInstance,
  limit: number,
  dryRun: boolean,
): Promise<{ triggered: number; skipped: number; staleImports: number }> {
  if (!instance.apiKey) {
    warn(`[${instance.name}] no API key configured, skipping`);
    return { triggered: 0, skipped: 0, staleImports: 0 };
  }

  banner(`Radarr · ${instance.name}`);
  const client = new ArrClient(instance);
  const queue = await maintainQueue(instance, client, dryRun);
  const all = await client.listMovies().catch((err) => {
    error(`[${instance.name}] failed to list movies`, err);
    return [];
  });

  const missing = all.filter(
    (m) => m.status === "released" && !m.hasFile && m.monitored,
  );
  const candidates = missing.filter((movie) => !queue.movieIds.has(movie.id));
  info(`[${instance.name}] ${missing.length} missing movies (${missing.length - candidates.length} queued; capped at ${limit})`);

  const targets = candidates.slice(0, limit);
  if (dryRun) {
    for (const m of targets) info(`  would search: [${m.id}] ${m.title}`);
    return { triggered: 0, skipped: missing.length - targets.length, staleImports: queue.staleImports };
  }

  let triggered = 0;
  for (const m of targets) {
    info(`  searching movie: [${m.id}] ${m.title}`);
    try {
      await client.triggerMovieSearch([m.id]);
      triggered++;
      info(`  search requested: [${m.id}] ${m.title}`);
    } catch (err) {
      warn(`[${instance.name}] failed to search [${m.id}] ${m.title}: ${(err as Error).message}`);
    }
  }
  info(`[${instance.name}] triggered ${triggered} search(es)`);
  return { triggered, skipped: missing.length - targets.length, staleImports: queue.staleImports };
}

async function searchSonarr(
  instance: ArrInstance,
  limit: number,
  dryRun: boolean,
): Promise<{ triggered: number; skipped: number; staleImports: number }> {
  if (!instance.apiKey) {
    warn(`[${instance.name}] no API key configured, skipping`);
    return { triggered: 0, skipped: 0, staleImports: 0 };
  }

  banner(`Sonarr · ${instance.name}`);
  const client = new ArrClient(instance);
  const queue = await maintainQueue(instance, client, dryRun);
  const pageSize = 50;
  let page = 1;
  let total = Infinity;
  const collected: ArrEpisodeResponse[] = [];
  let totalMissing = 0;

  while (collected.length < limit && (page - 1) * pageSize < total) {
    const { records, totalRecords } = await client.getWantedMissing(page, pageSize).catch((err) => {
      error(`[${instance.name}] wanted/missing failed on page ${page}`, err);
      return { records: [], totalRecords: 0 };
    });
    total = totalRecords;
    totalMissing = totalRecords;
    for (const ep of records) {
      if (!queue.episodeIds.has(ep.id)) collected.push(ep);
    }
    page++;
    if (records.length < pageSize) break;
  }

  info(`[${instance.name}] ${totalMissing} missing episodes (will trigger up to ${limit}; queued episodes skipped)`);

  const targets = collected.slice(0, limit);
  if (dryRun) {
    for (const episode of targets) info(`  would search: ${formatEpisode(episode)}`);
    return { triggered: 0, skipped: totalMissing - targets.length, staleImports: queue.staleImports };
  }

  // Batch to one EpisodeSearch call per group of 50 episode ids.
  const batches = chunk(targets, 50);
  let triggered = 0;
  for (const batch of batches) {
    for (const episode of batch) info(`  searching episode: ${formatEpisode(episode)}`);
    try {
      await client.triggerEpisodeSearch(batch.map((episode) => episode.id));
      triggered += batch.length;
      for (const episode of batch) info(`  search requested: ${formatEpisode(episode)}`);
    } catch (err) {
      warn(`[${instance.name}] episode search batch failed: ${(err as Error).message}`);
    }
  }
  info(`[${instance.name}] triggered ${triggered} episode search(es)`);
  return { triggered, skipped: totalMissing - targets.length, staleImports: queue.staleImports };
}

function formatEpisode(episode: ArrEpisodeResponse): string {
  const show = episode.series?.title ?? `series ${episode.seriesId}`;
  const number = `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  return `${show} ${number}${episode.title ? ` — ${episode.title}` : ""} [episode ${episode.id}]`;
}

// ── Module entry-point guard ───────────────────────────────────────────────
// Only run when invoked as the main module (not when imported by tests).
if (import.meta.main) {
  main().catch((err) => {
    error("Arr searcher failed", err);
    process.exit(1);
  });
}
