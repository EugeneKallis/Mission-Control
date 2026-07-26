#!/usr/bin/env bun
/**
 * sync-recently-played — query Plex for items watched in the last hour
 * and sync only those items to Trakt via plextraktsync sync --id.
 *
 * Goal: an hourly partial sync that catches episodes/movies you just
 * finished watching, avoiding a full library walk every time.
 *
 * Usage:
 *   just script scripts/plex/sync-recently-played.ts              # sync last 1 hour
 *   just script scripts/plex/sync-recently-played.ts -- --hours 2 # sync last 2 hours
 *   just script scripts/plex/sync-recently-played.ts -- --dry-run # print what would sync
 *
 * Dependencies:
 *   - PlexTraktSync at ../PlexTraktSync (or PLEXTRAKTSYNC_DIR env)
 *   - PLEX_TOKEN and PLEX_URL — set via the admin config page or .env
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

// ── Types ────────────────────────────────────────────────────────────────

interface PlexSearchResult {
  Metadata?: PlexMetadata[];
  size?: number;
}

interface PlexMetadata {
  ratingKey: string;
  title: string;
  type: "episode" | "movie" | string;
  grandparentTitle?: string;
  lastViewedAt?: number;
  viewCount?: number;
}

// ── Defaults ─────────────────────────────────────────────────────────────

/** Default PlexTraktSync location relative to this script's directory. */
const DEFAULT_PLEXTRACTSYNC_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "PlexTraktSync",
);

/** Time window (hours) — how far back to look for recently played. */
const DEFAULT_HOURS = 1;

/** Plex libtype IDs: 1=movie, 4=episode */
const PLEX_TYPE_MOVIE = "1";
const PLEX_TYPE_EPISODE = "4";

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Query Plex's /library/all endpoint with a lastViewedAt filter.
 * Returns Metadata items matching the filter.
 */
async function fetchRecentlyPlayed(
  plexUrl: string,
  token: string,
  libtype: string,
  since: number,
): Promise<PlexMetadata[]> {
  const url = new URL(`${plexUrl}/library/all`);
  url.searchParams.set("type", libtype);
  url.searchParams.set("lastViewedAt>>", String(since));
  url.searchParams.set("X-Plex-Token", token);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Plex API error (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { MediaContainer?: PlexSearchResult };
  return data.MediaContainer?.Metadata ?? [];
}

/**
 * Run `plextraktsync sync --id <ids>` for the given rating keys.
 * Returns { exitCode, output }.
 */
function runPlexTraktSync(
  ids: string[],
  plextraktsyncDir: string,
  dryRun: boolean,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const script = join(plextraktsyncDir, "plextraktsync.sh");
    const args = ["sync"];
    for (const id of ids) {
      args.push("--id", id);
    }
    if (dryRun) {
      info(`[DRY RUN] Would run: ${script} ${args.join(" ")}`);
      resolve({ exitCode: 0, output: "" });
      return;
    }

    info(`Running: ${script} sync --id <${ids.length} ids>`);

    const proc = spawn("bash", [script, ...args], {
      cwd: plextraktsyncDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: string[] = [];

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      chunks.push(text);
      process.stdout.write(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      chunks.push(text);
      process.stderr.write(text);
    });

    proc.on("error", (err) => {
      warn(`Spawn failed: ${err.message}`);
      resolve({ exitCode: 1, output: chunks.join("") });
    });

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 0, output: chunks.join("") });
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const args = parseArgs(
    {
      dryRun: { type: "boolean", default: false },
      hours: { type: "number", default: DEFAULT_HOURS },
    },
    argv,
  );

  banner("Plex Recently-Played Sync", { dryRun: args.dryRun });

  // 1. Load config (env vars + DB fallback via admin config page)
  const cfg = await resolveConfig();
  if (!cfg.plexToken) {
    error("PLEX_TOKEN not set — configure it in the admin config page (/admin)");
    process.exit(1);
  }
  if (!cfg.plexUrl) {
    error("PLEX_URL not set — configure it in the admin config page (/admin)");
    process.exit(1);
  }

  info(`Plex: ${cfg.plexUrl}`);
  info(`Window: ${args.hours}h`);

  // 2. Determine PlexTraktSync dir
  const plextraktsyncDir =
    process.env.PLEXTRACTSYNC_DIR ?? DEFAULT_PLEXTRACTSYNC_DIR;

  // 3. Calculate the timestamp (Unix epoch seconds) for the window
  //    Add a 5-minute overlap for safety so we don't miss items
  //    that were marked watched right at the boundary
  const overlapMinutes = 5;
  const since = Math.floor(
    (Date.now() - (args.hours * 3600 + overlapMinutes * 60) * 1000) / 1000,
  );

  // 4. Query Plex for recently played episodes and movies
  info(`Fetching recently played (since ${new Date(since * 1000).toISOString()})…`);

  const allItems: PlexMetadata[] = [];

  try {
    const episodes = await fetchRecentlyPlayed(
      cfg.plexUrl,
      cfg.plexToken,
      PLEX_TYPE_EPISODE,
      since,
    );
    allItems.push(...episodes);
    info(`  Episodes: ${episodes.length}`);
  } catch (err) {
    warn(`Failed to fetch recently played episodes: ${(err as Error).message}`);
  }

  try {
    const movies = await fetchRecentlyPlayed(
      cfg.plexUrl,
      cfg.plexToken,
      PLEX_TYPE_MOVIE,
      since,
    );
    allItems.push(...movies);
    info(`  Movies: ${movies.length}`);
  } catch (err) {
    warn(`Failed to fetch recently played movies: ${(err as Error).message}`);
  }

  // 5. Collect ratingKeys (deduplicated)
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of allItems) {
    if (seen.has(item.ratingKey)) continue;
    seen.add(item.ratingKey);
    ids.push(item.ratingKey);
  }

  if (ids.length === 0) {
    info("No recently played items found in this window. Nothing to sync.");
    summary({
      "Window (hours)": String(args.hours),
      "Items found": "0",
      "Status": "Skipped — nothing to sync",
    });
    return;
  }

  // 6. Deduplicate by grandparent title for nicer logging
  const showTitles = [
    ...new Set(
      allItems
        .filter((i) => i.grandparentTitle)
        .map((i) => i.grandparentTitle!),
    ),
  ];
  const movieTitles = [
    ...new Set(allItems.filter((i) => i.type === "movie").map((i) => i.title)),
  ];
  if (showTitles.length > 0) {
    info(`Shows with activity: ${showTitles.join(", ")}`);
  }
  if (movieTitles.length > 0) {
    info(`Movies with activity: ${movieTitles.join(", ")}`);
  }

  // 7. Run PlexTraktSync
  info(`Syncing ${ids.length} items to Trakt…`);
  const { exitCode } = await runPlexTraktSync(
    ids,
    plextraktsyncDir,
    args.dryRun,
  );

  // 8. Summary
  if (exitCode === 0) {
    summary({
      "Window (hours)": String(args.hours),
      "Items synced": String(ids.length),
      "Shows": String(showTitles.length),
      "Movies": String(movieTitles.length),
      "Status": args.dryRun ? "DRY RUN" : "Success",
    });
  } else {
    error(`PlexTraktSync exited with code ${exitCode}`);
    summary({
      "Status": "FAILED",
      "Exit code": String(exitCode),
    });
    process.exit(1);
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

if (import.meta.main) {
  main().catch((err) => {
    error("sync-recently-played failed", err);
    process.exit(1);
  });
}
