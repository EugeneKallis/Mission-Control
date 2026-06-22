#!/usr/bin/env bun
/**
 * plex-to-arr — sync Plex Continue Watching + Watchlist RSS to
 * Sonarr/Radarr. Auto-detects anime and routes to the right quality
 * profile + series type.
 *
 * Flow:
 *  1. Fetch Continue Watching from Plex + Watchlist RSS
 *  2. Deduplicate into shows + movies (CW takes priority)
 *  3. Fetch quality profiles + root folders from Arr
 *  4. For each show: check Sonarr, add if missing (with anime detection)
 *  5. For each movie: check Radarr, add if missing (with anime detection)
 *  6. Cache results to avoid re-checking next run
 *
 * Anime detection (in order):
 *  1. seriesType === "anime" (Sonarr SkyHook)
 *  2. "Anime" in genres
 *  3. "anime" in Plex keywords
 *  4. TVMaze fallback: isAnime(tvdbId)
 *
 * Usage:
 *   just script scripts/plex/plex-to-arr.ts -- --dry-run
 *   just script scripts/plex/plex-to-arr.ts -- --clean-cache
 *
 * Env:
 *   PLEX_TOKEN, PLEX_URL, PLEX_WATCHLIST_RSS
 *   ARR__SONARRLOCAL__API_KEY, ARR__RADARRLOCAL__API_KEY
 */

import { readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { ArrClient } from "@/lib/clients/arr";
import { isAnime } from "@/lib/clients/tvmaze";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

// ── Config ────────────────────────────────────────────────────────────────

const SONARR_NAME = "SonarrLocal";
const RADARR_NAME = "RadarrLocal";

const SONARR_DEFAULT_PROFILE = "WEB-1080p (Alternative)";
const SONARR_ANIME_PROFILE = "[Anime] Remux-1080p";
const RADARR_DEFAULT_PROFILE = "HD Bluray + WEB";
const RADARR_ANIME_PROFILE = "[Anime] Remux-1080p";

const CACHE_PATH = join(process.cwd(), ".plex-to-arr-cache.json");

// ── Types ─────────────────────────────────────────────────────────────────

interface CacheData {
  shows: Record<string, { addedAt: number; tvdbId: number }>;
  movies: Record<string, { addedAt: number; title: string }>;
}

interface ShowItem {
  title: string;
  parentIndex: number; // season
  index: number; // episode
  tvdbId: number;
  keywords: string[];
  source: "cw" | "rss";
}

interface MovieItem {
  title: string;
  tmdbId: number;
  source: "cw" | "rss";
}

interface RSSItem {
  title: string;
  category: string;
  tvdbId: number;
  keywords: string[];
}

// ── Cache helpers ─────────────────────────────────────────────────────────

async function loadCache(): Promise<CacheData> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return { shows: {}, movies: {} };
  }
}

async function saveCache(cache: CacheData): Promise<void> {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

async function cleanCache(): Promise<void> {
  await rm(CACHE_PATH, { force: true });
  info(`Cache cleared: ${CACHE_PATH}`);
}

// ── Plex helpers ──────────────────────────────────────────────────────────

async function fetchContinueWatching(plexUrl: string, plexToken: string) {
  const url = `${plexUrl}/hubs/continueWatching?X-Plex-Token=${encodeURIComponent(plexToken)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Plex API error (${res.status})`);
  const data = await res.json();
  const items: PlexMetadata[] = [];
  for (const hub of data?.MediaContainer?.Hub ?? []) {
    items.push(...(hub.Metadata ?? []));
  }
  items.push(...(data?.MediaContainer?.Metadata ?? []));
  return items;
}

async function fetchWatchlistRSS(rssUrl: string): Promise<RSSItem[]> {
  const res = await fetch(rssUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`RSS fetch error (${res.status})`);
  const xml = await res.text();
  return parseRSS(xml);
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  // Lightweight XML extraction — avoids a full DOM parse dependency.
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title") ?? "";
    const category = extractTag(block, "category") ?? "";
    const guid = extractTag(block, "guid") ?? "";
    const keywordsRaw = extractTag(block, "media:keywords") ?? extractTag(block, "keywords") ?? "";
    const keywords = keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];
    let tvdbId = 0;
    if (guid.startsWith("tvdb://")) {
      tvdbId = parseInt(guid.replace("tvdb://", ""), 10) || 0;
    }
    items.push({ title, category, tvdbId, keywords });
  }
  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

interface PlexMetadata {
  type: string;
  grandparentTitle?: string;
  title?: string;
  parentIndex?: number;
  index?: number;
  tvdbId?: number;
  tmdbId?: number;
  year?: number;
  Genre?: { tag: string }[];
}

// ── Anime detection ───────────────────────────────────────────────────────

async function detectAnime(
  seriesType: string | undefined,
  genres: string[] | undefined,
  keywords: string[],
  tvdbId: number,
): Promise<boolean> {
  // 1. Sonarr SkyHook seriesType
  if (seriesType?.toLowerCase() === "anime") return true;
  // 2. "Anime" in genres
  if (genres?.some((g) => g.toLowerCase() === "anime")) return true;
  // 3. "anime" in Plex keywords
  if (keywords.some((k) => k.toLowerCase() === "anime")) return true;
  // 4. TVMaze fallback
  if (tvdbId > 0 && await isAnime(tvdbId)) return true;
  return false;
}

function detectAnimeMovie(genres: string[] | undefined): boolean {
  return genres?.some((g) => g.toLowerCase() === "anime") ?? false;
}

// ── Profile helpers ───────────────────────────────────────────────────────

function findProfileId(profiles: { id: number; name: string }[], name: string): number | undefined {
  return profiles.find((p) => p.name === name)?.id;
}

// ── Main ──────────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const args = parseArgs(
    {
      dryRun: { type: "boolean", default: false },
      cleanCache: { type: "boolean", default: false },
    },
    argv,
  );

  banner("plex-to-arr", { dryRun: args.dryRun });

  if (args.cleanCache) await cleanCache();
  const cache = await loadCache();

  const cfg = getConfig();
  const sonarrInst = cfg.arrInstances.find((i) => i.name === SONARR_NAME);
  const radarrInst = cfg.arrInstances.find((i) => i.name === RADARR_NAME);

  if (!sonarrInst || !sonarrInst.apiKey) {
    error(`${SONARR_NAME} not configured or missing API key`);
    process.exit(1);
  }
  if (!radarrInst || !radarrInst.apiKey) {
    error(`${RADARR_NAME} not configured or missing API key`);
    process.exit(1);
  }

  const sonarr = new ArrClient(sonarrInst);
  const radarr = new ArrClient(radarrInst);

  info(`Plex: ${cfg.plexUrl}`);
  info(`Sonarr: ${sonarrInst.url}`);
  info(`Radarr: ${radarrInst.url}`);

  // 1. Fetch Continue Watching
  info("Fetching Continue Watching from Plex…");
  let cwItems: PlexMetadata[] = [];
  try {
    cwItems = await fetchContinueWatching(cfg.plexUrl, cfg.plexToken);
    info(`  Found ${cwItems.length} items`);
  } catch (err) {
    error("Failed to fetch Continue Watching", err);
    process.exit(1);
  }

  // 2. Fetch Watchlist RSS
  info("Fetching Watchlist RSS from Plex…");
  let rssItems: RSSItem[] = [];
  if (cfg.plexWatchlistRss) {
    try {
      rssItems = await fetchWatchlistRSS(cfg.plexWatchlistRss);
      info(`  Found ${rssItems.length} items`);
    } catch (err) {
      warn(`RSS fetch failed: ${(err as Error).message}`);
    }
  } else {
    warn("PLEX_WATCHLIST_RSS not set, skipping RSS");
  }

  // 3. Deduplicate
  const tvShows = new Map<string, ShowItem>();
  const movies = new Map<string, MovieItem>();

  for (const item of cwItems) {
    if (item.type === "episode" && item.grandparentTitle) {
      const title = item.grandparentTitle;
      const existing = tvShows.get(title);
      const season = item.parentIndex ?? 1;
      const episode = item.index ?? 1;
      if (!existing || season < existing.parentIndex || (season === existing.parentIndex && episode < existing.index)) {
        tvShows.set(title, {
          title,
          parentIndex: season,
          index: episode,
          tvdbId: item.tvdbId ?? 0,
          keywords: (item.Genre ?? []).map((g) => g.tag),
          source: "cw",
        });
      }
    } else if (item.type === "movie" && item.title) {
      if (!movies.has(item.title)) {
        movies.set(item.title, {
          title: item.title,
          tmdbId: item.tmdbId ?? 0,
          source: "cw",
        });
      }
    }
  }

  for (const rss of rssItems) {
    if (rss.category === "show" && rss.title && !tvShows.has(rss.title)) {
      tvShows.set(rss.title, {
        title: rss.title,
        parentIndex: 1,
        index: 1,
        tvdbId: rss.tvdbId,
        keywords: rss.keywords,
        source: "rss",
      });
    } else if (rss.category === "movie" && rss.title && !movies.has(rss.title)) {
      movies.set(rss.title, {
        title: rss.title,
        tmdbId: 0,
        source: "rss",
      });
    }
  }

  const cwShows = [...tvShows.values()].filter((s) => s.source === "cw").length;
  const rssShows = [...tvShows.values()].filter((s) => s.source === "rss").length;
  info(`Unique: ${tvShows.size} shows (CW ${cwShows} + RSS ${rssShows}), ${movies.size} movies`);

  // 4. Fetch quality profiles + root folders
  info("Fetching Sonarr quality profiles…");
  const sonarrProfiles = await sonarr.listQualityProfiles().catch((err) => {
    warn(`Sonarr profiles failed: ${(err as Error).message}`);
    return [];
  });
  let sonarrDefaultProfile = findProfileId(sonarrProfiles, SONARR_DEFAULT_PROFILE) ?? 1;
  let sonarrAnimeProfile = findProfileId(sonarrProfiles, SONARR_ANIME_PROFILE) ?? sonarrDefaultProfile;
  info(`  Default: ${sonarrDefaultProfile} ('${SONARR_DEFAULT_PROFILE}')`);
  info(`  Anime:   ${sonarrAnimeProfile} ('${SONARR_ANIME_PROFILE}')`);

  const sonarrRoots = await sonarr.listRootFolders().catch(() => []);
  const sonarrRoot = sonarrRoots[0]?.path ?? "/mnt/data/media/tvlocal";
  info(`  Root: ${sonarrRoot}`);

  info("Fetching Radarr quality profiles…");
  const radarrProfiles = await radarr.listQualityProfiles().catch((err) => {
    warn(`Radarr profiles failed: ${(err as Error).message}`);
    return [];
  });
  let radarrDefaultProfile = findProfileId(radarrProfiles, RADARR_DEFAULT_PROFILE) ?? 1;
  if (radarrDefaultProfile === 1 && radarrProfiles.length > 0) radarrDefaultProfile = radarrProfiles[0].id;
  const radarrAnimeProfile = findProfileId(radarrProfiles, RADARR_ANIME_PROFILE) ?? radarrDefaultProfile;
  info(`  Default: ${radarrDefaultProfile} ('${RADARR_DEFAULT_PROFILE}')`);
  info(`  Anime:   ${radarrAnimeProfile} ('${RADARR_ANIME_PROFILE}')`);

  const radarrRoots = await radarr.listRootFolders().catch(() => []);
  const radarrRoot = radarrRoots[0]?.path ?? "/mnt/data/media/movieslocal";
  info(`  Root: ${radarrRoot}`);

  // 5. Process TV shows (Sonarr)
  info("\n── Processing TV Shows (Sonarr) ──");
  let showsAdded = 0;
  let showsSkipped = 0;

  for (const [showTitle, item] of tvShows) {
    info(`Checking: ${showTitle} (S${String(item.parentIndex).padStart(2, "0")}E${String(item.index).padStart(2, "0")})`);

    // Check cache first (non-dry-run only)
    if (!args.dryRun && showTitle in cache.shows) {
      info(`  Skipped (cached): ${showTitle}`);
      showsSkipped++;
      continue;
    }

    // Check Sonarr via lookup
    let exists = false;
    try {
      const results = await sonarr.lookupSeries(showTitle);
      exists = results.some((r) => r.id > 0);
      if (!args.dryRun) {
        if (exists) {
          cache.shows[showTitle] = { addedAt: Date.now(), tvdbId: results[0]?.tvdbId ?? 0 };
        } else {
          delete cache.shows[showTitle];
        }
      }
    } catch (err) {
      warn(`  Lookup failed: ${(err as Error).message}`);
      continue;
    }

    if (exists) {
      info(`  Confirmed in Sonarr: ${showTitle}`);
      showsSkipped++;
      continue;
    }

    // Add to Sonarr
    info(`  Missing — adding…`);
    try {
      await addShowToSonarr(sonarr, showTitle, item, sonarrDefaultProfile, sonarrAnimeProfile, sonarrRoot, args.dryRun);
      showsAdded++;
    } catch (err) {
      warn(`  Failed: ${(err as Error).message}`);
    }
  }

  // 6. Process movies (Radarr)
  info("\n── Processing Movies (Radarr) ──");
  let moviesAdded = 0;
  let moviesSkipped = 0;

  for (const [movieTitle, item] of movies) {
    info(`Checking: ${movieTitle}`);

    if (item.tmdbId <= 0) {
      warn(`  No TMDB id, skipping`);
      continue;
    }

    const cacheKey = String(item.tmdbId);
    if (!args.dryRun && cacheKey in cache.movies) {
      info(`  Skipped (cached): ${movieTitle}`);
      moviesSkipped++;
      continue;
    }

    let exists = false;
    try {
      const results = await radarr.lookupMovie(`tmdb:${item.tmdbId}`);
      exists = results.some((r) => r.id > 0);
      if (!args.dryRun) {
        if (exists) {
          cache.movies[cacheKey] = { addedAt: Date.now(), title: movieTitle };
        } else {
          delete cache.movies[cacheKey];
        }
      }
    } catch (err) {
      warn(`  Lookup failed: ${(err as Error).message}`);
      continue;
    }

    if (exists) {
      info(`  Confirmed in Radarr: ${movieTitle}`);
      moviesSkipped++;
      continue;
    }

    info(`  Missing — adding…`);
    try {
      await addMovieToRadarr(radarr, movieTitle, item.tmdbId, radarrDefaultProfile, radarrAnimeProfile, radarrRoot, args.dryRun);
      moviesAdded++;
    } catch (err) {
      warn(`  Failed: ${(err as Error).message}`);
    }
  }

  // 7. Summary
  summary({
    "Shows added:": args.dryRun ? `${showsAdded} (dry-run)` : String(showsAdded),
    "Shows skipped:": String(showsSkipped),
    "Movies added:": args.dryRun ? `${moviesAdded} (dry-run)` : String(moviesAdded),
    "Movies skipped:": String(moviesSkipped),
    "Mode:": args.dryRun ? "DRY RUN" : "LIVE",
  });

  if (!args.dryRun) await saveCache(cache);
}

// ── Add helpers ───────────────────────────────────────────────────────────

async function addShowToSonarr(
  client: ArrClient,
  title: string,
  item: ShowItem,
  defaultProfileId: number,
  animeProfileId: number,
  rootFolder: string,
  dryRun: boolean,
): Promise<void> {
  const searchTerm = item.tvdbId > 0 ? `tvdb:${item.tvdbId}` : title;
  const results = await client.lookupSeries(searchTerm);
  if (results.length === 0) {
    warn(`  Series not found: ${searchTerm}`);
    return;
  }

  const series = results[0];
  const anime = await detectAnime(series.seriesType, series.genres, item.keywords, series.tvdbId ?? 0);
  const profileId = anime ? animeProfileId : defaultProfileId;
  const seriesType = anime ? "anime" : (series.seriesType ?? "standard");

  if (anime) info(`  Anime detected: '${series.title}'. Using profile ${profileId}.`);

  const seasons = (series.seasons ?? []).map((s) => ({
    seasonNumber: s.seasonNumber,
    monitored: s.seasonNumber >= item.parentIndex,
  }));

  if (dryRun) {
    info(`  [DRY RUN] Would add: ${series.title} (type=${seriesType}, profile=${profileId})`);
    return;
  }

  const added = await client.addSeries({
    tvdbId: series.tvdbId ?? 0,
    title: series.title,
    qualityProfileId: profileId,
    rootFolderPath: rootFolder,
    monitored: true,
    seriesType,
    images: series.images,
    seasons,
    addOptions: { searchForMissingEpisodes: false },
  }) as { id: number };

  info(`  Added: ${series.title} (ID=${added.id})`);
  await client.triggerSeriesSearch(added.id);
  info(`  Search triggered`);
}

async function addMovieToRadarr(
  client: ArrClient,
  title: string,
  tmdbId: number,
  defaultProfileId: number,
  animeProfileId: number,
  rootFolder: string,
  dryRun: boolean,
): Promise<void> {
  const searchTerm = tmdbId > 0 ? `tmdb:${tmdbId}` : title;
  const results = await client.lookupMovie(searchTerm);
  if (results.length === 0) {
    warn(`  Movie not found: ${searchTerm}`);
    return;
  }

  const movie = results[0];
  if (movie.id > 0) {
    info(`  Already exists in Radarr: ${title} (ID=${movie.id})`);
    return;
  }

  const anime = detectAnimeMovie(movie.genres);
  const profileId = anime ? animeProfileId : defaultProfileId;

  if (anime) info(`  Anime movie detected: '${movie.title}'. Using profile ${profileId}.`);

  if (dryRun) {
    info(`  [DRY RUN] Would add: ${movie.title} (tmdb=${movie.tmdbId})`);
    return;
  }

  const added = await client.addMovie({
    tmdbId: movie.tmdbId,
    title: movie.title,
    qualityProfileId: profileId,
    rootFolderPath: rootFolder,
    monitored: true,
    images: movie.images,
    addOptions: { searchForMissingEpisodes: false },
  }) as { id: number };

  info(`  Added: ${movie.title} (ID=${added.id})`);
  await client.triggerMovieSearch([added.id]);
  info(`  Search triggered`);
}

// ── Entry point ───────────────────────────────────────────────────────────

if (import.meta.main) {
  main().catch((err) => {
    error("plex-to-arr failed", err);
    process.exit(1);
  });
}
