#!/usr/bin/env bun
/**
 * Sonarr season searcher — trigger `SeasonSearch` for fully-aired seasons
 * that have no downloaded episodes.
 *
 * For each series in the Sonarr instance, walks every season. A season
 * "needs search" if:
 *   - it's not season 0 (the specials season)
 *   - it's monitored
 *   - all episodes have already aired (i.e. airDate < now)
 *   - none of the episodes have a file
 *
 * Useful for catch-up after long downtime, since the regular
 * `EpisodeSearch` skips over a season that was searched before.
 *
 * Usage:
 *   just script scripts/arr/sonarr-season-searcher.ts
 *   just script scripts/arr/sonarr-season-searcher.ts -- --dry-run
 *   just script scripts/arr/sonarr-season-searcher.ts -- --instance Sonarr4K
 */

import { ArrClient } from "@/lib/clients/arr";
import { getConfig } from "@/lib/config";
import { groupBy } from "../_lib/collections";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";
import type { ArrInstance } from "@/types";

async function main(argv?: string[]) {
  const args = parseArgs(
    {
      dryRun: { type: "boolean", default: false },
      instance: { type: "string", default: "Sonarr" },
    },
    argv,
  );
  banner("Sonarr season searcher", { dryRun: args.dryRun });

  const config = getConfig();
  const inst = config.arrInstances.find(
    (i) => i.type === "sonarr" && i.name.toLowerCase() === args.instance.toLowerCase(),
  );
  if (!inst) {
    error(`Sonarr instance not found: ${args.instance}`);
    process.exit(1);
  }
  if (!inst.apiKey) {
    error(`No API key for ${inst.name}`);
    process.exit(1);
  }

  const client = new ArrClient(inst);
  const series = await client.listSeries().catch((err) => {
    error(`Failed to list series in ${inst.name}`, err);
    return [];
  });
  info(`[${inst.name}] ${series.length} series`);

  // For each series, fetch its episodes (one call per series).
  let seasonsSearched = 0;
  for (const s of series) {
    const episodes = await fetchEpisodes(inst, s.id);
    if (!episodes) continue;

    const bySeason = groupBy(episodes, (e) => e.seasonNumber);
    for (const [seasonNum, eps] of bySeason) {
      if (seasonNum === 0) continue;
      // Skip seasons where every episode is unmonitored — SeasonSearch
      // would do nothing useful. Sonarr's SeasonSearch respects
      // episode-level monitoring.
      if (eps.every((e) => !e.monitored)) continue;
      if (eps.every((e) => e.hasFile)) continue;
      // Skip seasons with episodes that haven't aired yet.
      const now = Date.now();
      if (eps.some((e) => e.airDateUtc && new Date(e.airDateUtc).getTime() > now)) continue;

      if (args.dryRun) {
        info(`  would SeasonSearch: [${s.id}] ${s.title} S${String(seasonNum).padStart(2, "0")} (${eps.length} eps, none have files)`);
        continue;
      }
      try {
        await client.triggerSeasonSearch(s.id, seasonNum);
        seasonsSearched++;
      } catch (err) {
        warn(`Failed SeasonSearch [${s.id}] ${s.title} S${seasonNum}: ${(err as Error).message}`);
      }
    }
  }

  summary({
    "Seasons searched:": seasonsSearched,
    "Mode:": args.dryRun ? "DRY RUN" : "LIVE",
  });
}

interface Episode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  hasFile: boolean;
  monitored: boolean;
  airDateUtc?: string;
}

async function fetchEpisodes(inst: ArrInstance, seriesId: number): Promise<Episode[] | null> {
  const res = await fetch(
    `${inst.url.replace(/\/+$/, "")}/api/v3/episode?seriesId=${seriesId}`,
    { headers: { "X-Api-Key": inst.apiKey } },
  );
  if (!res.ok) {
    warn(`Failed to fetch episodes for series ${seriesId}: ${res.status}`);
    return null;
  }
  return res.json() as Promise<Episode[]>;
}

export { main };

if (import.meta.main) {
  main().catch((err) => {
    error("sonarr-season-searcher failed", err);
    process.exit(1);
  });
}
