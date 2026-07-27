#!/usr/bin/env bun
/**
 * sync-recently-played — query Plex for items watched in the last hour
 * and sync only those items to Trakt via plextraktsync sync --id.
 *
 * Goal: an hourly partial sync that catches episodes/movies you just
 * finished watching, avoiding a full library walk every time.
 *
 * Usage:
 *   just script scripts/plex/sync-recently-played.ts                          # dry-run (default)
 *   just script scripts/plex/sync-recently-played.ts -- --no-dry-run          # actually sync
 *   just script scripts/plex/sync-recently-played.ts -- --hours 2             # last 2 hours
 *   just script scripts/plex/sync-recently-played.ts -- --binary /usr/bin/plextraktsync
 *   just script scripts/plex/sync-recently-played.ts -- --timeout 300         # 5 minute timeout
 *
 * Env:
 *   PLEX_TOKEN and PLEX_URL — set via the admin config page or .env
 *   PLEXTRAKTSYNC_BIN       — path to plextraktsync (overridable via --binary)
 */

import { spawn } from "child_process";
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

/** Time window (hours) — how far back to look for recently played. */
const DEFAULT_HOURS = 1;

/** Spawn timeout in seconds before we SIGTERM the child. */
const DEFAULT_TIMEOUT_SEC = 120;

/** Plex libtype IDs: 1=movie, 4=episode */
const PLEX_TYPE_MOVIE = "1";
const PLEX_TYPE_EPISODE = "4";

/** Default plextraktsync binary path. */
const DEFAULT_BINARY = process.env.PLEXTRAKTSYNC_BIN || "/root/.local/bin/plextraktsync";

// ── Helpers ──────────────────────────────────────────────────────────────

export function buildPlexTraktSyncArgs(ids: string[]): string[] {
  const args = ["sync"];
  for (const id of ids) {
    args.push("--id", id);
  }
  return args;
}

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
 *
 * Uses a configurable binary path. Applies a bounded timeout: if the
 * child does not exit within timeoutSec seconds, it is killed and the
 * promise resolves with exitCode -1 / SIGTERM.
 *
 * Stdout and stderr are forwarded to the parent process in real time
 * and also accumulated into the returned output string.
 */
export function runPlexTraktSync(
  binary: string,
  ids: string[],
  dryRun: boolean,
  timeoutSec: number = DEFAULT_TIMEOUT_SEC,
): Promise<{ exitCode: number; output: string }> {
  if (dryRun) {
    const args = buildPlexTraktSyncArgs(ids);
    info(`[DRY RUN] Would run: ${binary} ${args.join(" ")}`);
    return Promise.resolve({ exitCode: 0, output: "" });
  }

  const args = buildPlexTraktSyncArgs(ids);
  info(`Running: ${binary} sync --id <${ids.length} ids>`);

  return new Promise((resolve) => {
    const proc = spawn(binary, args, {
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

    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      warn(`Timeout (${timeoutSec}s) reached — killing ${binary}`);
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      // Give it 3 seconds to clean up, then SIGKILL.
      // Keep a reference so close/error can cancel if the process
      // exits gracefully between SIGTERM and the SIGKILL deadline.
      killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
        killTimer = null;
      }, 3_000);
      resolve({ exitCode: -1, output: chunks.join("") });
    }, timeoutSec * 1000);

    const cancelKillTimer = () => {
      if (killTimer !== null) {
        clearTimeout(killTimer);
        killTimer = null;
      }
    };

    proc.on("error", (err) => {
      cancelKillTimer();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      warn(`Spawn failed: ${err.message}`);
      resolve({ exitCode: 1, output: chunks.join("") });
    });

    proc.on("close", (code) => {
      cancelKillTimer();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 0, output: chunks.join("") });
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const args = parseArgs(
    {
      dryRun: { type: "boolean", default: true },
      hours: { type: "number", default: DEFAULT_HOURS },
      binary: { type: "string", default: DEFAULT_BINARY },
      timeout: { type: "number", default: DEFAULT_TIMEOUT_SEC },
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
  info(`Binary: ${args.binary}`);
  info(`Timeout: ${args.timeout}s`);

  // 2. Calculate the timestamp (Unix epoch seconds) for the window
  //    Add a 5-minute overlap for safety so we don't miss items
  //    that were marked watched right at the boundary
  const overlapMinutes = 5;
  const since = Math.floor(
    (Date.now() - (args.hours * 3600 + overlapMinutes * 60) * 1000) / 1000,
  );

  // 3. Query Plex for recently played episodes and movies
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

  // 4. Collect ratingKeys (deduplicated)
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

  // 5. Deduplicate by grandparent title for nicer logging
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

  // 6. Run PlexTraktSync
  info(`Syncing ${ids.length} items to Trakt…`);
  const { exitCode } = await runPlexTraktSync(args.binary, ids, args.dryRun, args.timeout);

  // 7. Summary
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
