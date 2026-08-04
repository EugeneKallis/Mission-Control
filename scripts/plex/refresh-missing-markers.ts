#!/usr/bin/env bun
/**
 * refresh-missing-markers — find Plex episodes/movies missing intro or
 * credits markers and queue detection ONLY for those items. Existing
 * markers are never re-run, nothing is force-redetected (no `force=1`),
 * and the Plex database is never touched.
 *
 * Flow:
 *  1. List Plex library sections (optionally filtered to one library)
 *  2. Paginate item keys (episodes type=4, movies type=1) using the
 *     X-Plex-Container-Start/Size headers (the `start` query param is
 *     ignored by PMS and loops forever)
 *  3. Per item, GET /library/metadata/<ratingKey>?includeMarkers=1 —
 *     this PMS only returns Marker data on the detail endpoint, never
 *     in /all listings
 *  4. Classify each item per marker type: present / missing /
 *     previously attempted
 *  5. In live mode (--run), PUT /library/metadata/<ratingKey>/{intro|credits}
 *     for missing types only. Successful requests (200 or 202 — credits
 *     detection is async) are recorded in a local state file so items
 *     Plex can't detect aren't re-requested every run.
 *
 * Dry-run is the default (safe preview). Pass --run to actually queue
 * detection jobs.
 *
 * Usage:
 *   just script scripts/plex/refresh-missing-markers.ts
 *   just script scripts/plex/refresh-missing-markers.ts -- --library "TV Shows"
 *   just script scripts/plex/refresh-missing-markers.ts -- --run
 *   just script scripts/plex/refresh-missing-markers.ts -- --run --retry-attempted
 *   just script scripts/plex/refresh-missing-markers.ts -- --run --library 1 --delay-ms 20
 *
 * Env:
 *   PLEX_TOKEN and PLEX_URL — set via the admin config page or .env
 *
 * State:
 *   ~/.local/state/mission-control/plex-marker-refresh.json
 *   Records (ratingKey → marker types) whose detection request Plex
 *   accepted. --retry-attempted re-queues those items (still without
 *   force), for cases like a file replacement or a buggy detection.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";
import { resolveConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

// ── Types ────────────────────────────────────────────────────────────────

export interface PlexMarker {
  type: string;
  startTimeOffset?: number;
  endTimeOffset?: number;
}

export interface PlexItem {
  ratingKey: string;
  title?: string;
  type: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  Marker?: PlexMarker[];
}

export interface PlexLibrary {
  key: string;
  title: string;
  type?: string;
}

export interface RefreshState {
  attempted: Record<string, string[]>; // ratingKey → marker types accepted by Plex
  updatedAt: string;
}

export interface ItemPlan {
  present: string[];
  missing: string[];
  skipAttempted: string[];
}

// ── Constants ────────────────────────────────────────────────────────────

const STATE_DIR = join(homedir(), ".local", "state", "mission-control");
const DEFAULT_STATE_PATH = join(STATE_DIR, "plex-marker-refresh.json");

const PLEX_TYPE_MOVIE = "1";
const PLEX_TYPE_EPISODE = "4";
const PAGE_SIZE = 200;
const DEFAULT_DELAY_MS = 50;
const REQUEST_TIMEOUT_MS = 60_000;

// ── Pure helpers ─────────────────────────────────────────────────────────

/** Marker types a Plex item type is eligible for. */
export function markerTypesFor(itemType: string): string[] {
  if (itemType === "episode") return ["intro", "credits"];
  if (itemType === "movie") return ["credits"];
  return [];
}

export function hasMarker(item: PlexItem, markerType: string): boolean {
  return (item.Marker ?? []).some((m) => m.type === markerType);
}

/**
 * Decide per marker type what to do with an item.
 * `missing` = types to queue detection for now.
 */
export function classifyItem(
  item: PlexItem,
  attempted: Record<string, string[]>,
  retryAttempted: boolean,
): ItemPlan {
  const plan: ItemPlan = { present: [], missing: [], skipAttempted: [] };
  const attemptedTypes = attempted[item.ratingKey] ?? [];
  for (const t of markerTypesFor(item.type)) {
    if (hasMarker(item, t)) {
      plan.present.push(t);
    } else if (!retryAttempted && attemptedTypes.includes(t)) {
      plan.skipAttempted.push(t);
    } else {
      plan.missing.push(t);
    }
  }
  return plan;
}

/** Filter libraries by name (case-insensitive) or numeric key. Empty filter = all. */
export function pickLibraries(libs: PlexLibrary[], filter: string): PlexLibrary[] {
  if (!filter) return libs;
  const needle = filter.trim().toLowerCase();
  return libs.filter(
    (l) =>
      l.key === filter ||
      (l.title ?? "").toLowerCase() === needle ||
      (l.title ?? "").toLowerCase().includes(needle),
  );
}

/** Pure state update: mark (ratingKey, markerType) as successfully requested. */
export function recordAttempt(
  state: RefreshState,
  ratingKey: string,
  markerType: string,
): RefreshState {
  const attempted = { ...state.attempted };
  const types = new Set(attempted[ratingKey] ?? []);
  types.add(markerType);
  attempted[ratingKey] = [...types].sort();
  return { attempted, updatedAt: new Date().toISOString() };
}

// ── State helpers ────────────────────────────────────────────────────────

export async function loadState(path: string): Promise<RefreshState> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<RefreshState>;
    return { attempted: parsed.attempted ?? {}, updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return { attempted: {}, updatedAt: "" };
  }
}

/** Atomic write (tmp + rename) so a crash never leaves a corrupt state file. */
export async function saveState(path: string, state: RefreshState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, path);
}

// ── Plex API ─────────────────────────────────────────────────────────────

async function plexFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Plex-Token": token,
      Accept: "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Plex API error (${res.status})`);
  return res.json() as Promise<T>;
}

async function fetchLibraries(baseUrl: string, token: string): Promise<PlexLibrary[]> {
  const data = await plexFetch<{ MediaContainer?: { Directory?: PlexLibrary[] } }>(
    `${baseUrl}/library/sections`,
    token,
  );
  return data.MediaContainer?.Directory ?? [];
}

/**
 * Paginate /library/sections/{key}/all for one libtype using the
 * X-Plex-Container-Start/Size headers (the `start` query param is
 * ignored by PMS). Returns item metadata WITHOUT markers — marker data
 * only appears on the per-item detail endpoint (see fetchItemDetail).
 */
async function fetchItemKeys(
  baseUrl: string,
  token: string,
  sectionKey: string,
  libType: string,
): Promise<PlexItem[]> {
  const items: PlexItem[] = [];
  let start = 0;
  for (;;) {
    const url = new URL(`${baseUrl}/library/sections/${sectionKey}/all`);
    url.searchParams.set("type", libType);
    url.searchParams.set("includeMarkers", "1");

    const data = await plexFetch<{ MediaContainer?: { size?: number; totalSize?: number; Metadata?: PlexItem[] } }>(
      url.toString(),
      token,
      {
        headers: {
          "X-Plex-Container-Size": String(PAGE_SIZE),
          "X-Plex-Container-Start": String(start),
        },
      },
    );
    const mc = data.MediaContainer ?? {};
    const page = mc.Metadata ?? [];
    items.push(...page);
    start += page.length;

    if (page.length === 0 || page.length < PAGE_SIZE) break;
    if (mc.totalSize !== undefined && start >= mc.totalSize) break;
  }
  return items;
}

/** Fetch one item's detail (the only response shape that carries Marker data). */
export async function fetchItemDetail(
  baseUrl: string,
  token: string,
  ratingKey: string,
): Promise<PlexItem> {
  const url = new URL(`${baseUrl}/library/metadata/${ratingKey}`);
  url.searchParams.set("includeMarkers", "1");
  const data = await plexFetch<{ MediaContainer?: { Metadata?: PlexItem[] } }>(
    url.toString(),
    token,
  );
  const item = data.MediaContainer?.Metadata?.[0];
  if (!item) throw new Error(`No metadata returned for ratingKey ${ratingKey}`);
  return item;
}

/**
 * Queue detection for one item/marker type. Plex returns 200 for intros
 * and 202 (async) for credits; both are success.
 */
export async function requestDetection(
  baseUrl: string,
  token: string,
  ratingKey: string,
  markerType: string,
): Promise<boolean> {
  const res = await fetch(`${baseUrl}/library/metadata/${ratingKey}/${markerType}`, {
    method: "PUT",
    headers: { "X-Plex-Token": token, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res.ok;
}

// ── Logging ──────────────────────────────────────────────────────────────

function describeItem(item: PlexItem): string {
  if (item.type === "episode") {
    const s = String(item.parentIndex ?? 0).padStart(2, "0");
    const e = String(item.index ?? 0).padStart(2, "0");
    return `${item.grandparentTitle ?? "?"} S${s}E${e} (${item.title ?? "?"})`;
  }
  return `${item.title ?? "?"} (${item.ratingKey})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function main(argv?: string[]): Promise<void> {
  const args = parseArgs(
    {
      run: { type: "boolean", default: false },
      library: { type: "string", default: "" },
      retryAttempted: { type: "boolean", default: false },
      delayMs: { type: "number", default: DEFAULT_DELAY_MS },
      statePath: { type: "string", default: "" },
    },
    argv,
  );
  const dryRun = !args.run;
  const statePath = args.statePath || DEFAULT_STATE_PATH;

  banner("Plex Missing Markers", { dryRun });

  const cfg = await resolveConfig();
  if (!cfg.plexToken || !cfg.plexUrl) {
    error("PLEX_TOKEN / PLEX_URL not set — configure them in the admin config page (/admin)");
    process.exit(1);
  }
  const baseUrl = cfg.plexUrl.replace(/\/+$/, "");
  info(`Plex: ${baseUrl}`);
  if (args.library) info(`Library filter: ${args.library}`);
  if (args.retryAttempted) info("Retrying previously attempted items");

  // 1. Libraries
  const allLibs = await fetchLibraries(baseUrl, cfg.plexToken);
  if (allLibs.length === 0) {
    error("No Plex libraries found");
    process.exit(1);
  }
  const libs = pickLibraries(allLibs, args.library);
  if (libs.length === 0) {
    error(`No libraries match filter: ${args.library}`);
    process.exit(1);
  }
  info(`Libraries: ${libs.map((l) => `${l.title} [${l.key}]`).join(", ")}`);

  const state = await loadState(statePath);

  const totals = { items: 0, present: 0, missing: 0, skipAttempted: 0, requested: 0, failed: 0 };
  const failures: string[] = [];
  const attemptedNow = new Set<string>(); // "ratingKey/markerType"

  // 2. Walk libraries
  for (const lib of libs) {
    const libTypes =
      lib.type === "movie"
        ? [PLEX_TYPE_MOVIE]
        : lib.type === "show"
          ? [PLEX_TYPE_EPISODE]
          : [];
    if (libTypes.length === 0) {
      warn(`Skipping library "${lib.title}" (unsupported type: ${lib.type ?? "unknown"})`);
      continue;
    }

    for (const libType of libTypes) {
      let listed: PlexItem[] = [];
      try {
        listed = await fetchItemKeys(baseUrl, cfg.plexToken, lib.key, libType);
      } catch (err) {
        warn(`Failed to list ${libType === PLEX_TYPE_MOVIE ? "movies" : "episodes"} from "${lib.title}": ${(err as Error).message}`);
        continue;
      }
      info(`  ${lib.title}: ${listed.length} ${libType === PLEX_TYPE_MOVIE ? "movies" : "episodes"} to check`);

      for (const listedItem of listed) {
        // 2a. Per-item detail is the only response that carries markers
        let item: PlexItem;
        try {
          item = await fetchItemDetail(baseUrl, cfg.plexToken, listedItem.ratingKey);
        } catch (err) {
          warn(`  Detail fetch failed (${listedItem.ratingKey}): ${(err as Error).message}`);
          totals.failed++;
          failures.push(`${listedItem.ratingKey}/detail`);
          if (args.delayMs > 0) await sleep(args.delayMs);
          continue;
        }

        totals.items++;
        const plan = classifyItem(item, state.attempted, args.retryAttempted);
        totals.present += plan.present.length;
        totals.missing += plan.missing.length;
        totals.skipAttempted += plan.skipAttempted.length;

        if (plan.missing.length > 0) {
          info(`  Missing [${plan.missing.join(",")}]: ${describeItem(item)}`);
        }

        if (!dryRun) {
          for (const t of plan.missing) {
            const ok = await requestDetection(baseUrl, cfg.plexToken, item.ratingKey, t).catch((err) => {
              warn(`  Request failed (${item.ratingKey}/${t}): ${(err as Error).message}`);
              return false;
            });
            if (ok) {
              totals.requested++;
              attemptedNow.add(`${item.ratingKey}/${t}`);
            } else {
              totals.failed++;
              failures.push(`${item.ratingKey}/${t}`);
            }
            if (args.delayMs > 0) await sleep(args.delayMs);
          }
        } else {
          totals.requested += plan.missing.length;
        }

        if (args.delayMs > 0) await sleep(args.delayMs);
      }
    }
  }

  // 3. Persist successful requests (live mode only, failures excluded)
  if (!dryRun && attemptedNow.size > 0) {
    let next = state;
    for (const key of attemptedNow) {
      const [rk, t] = key.split("/");
      next = recordAttempt(next, rk, t);
    }
    await saveState(statePath, next);
    info(`State saved: ${statePath}`);
  }

  if (failures.length > 0) {
    warn(`Failed requests (${failures.length}): ${failures.join(", ")}`);
  }

  summary({
    "Libraries": String(libs.length),
    "Items examined": String(totals.items),
    "Markers present": String(totals.present),
    "Markers missing": String(totals.missing),
    "Previously attempted": String(totals.skipAttempted),
    "Detection queued": dryRun ? `${totals.requested} (dry-run)` : String(totals.requested),
    "Failed": String(totals.failed),
    "State": dryRun ? "not written (dry-run)" : statePath,
  });
}

// ── Entry point ──────────────────────────────────────────────────────────

if (import.meta.main) {
  main().catch((err) => {
    error("refresh-missing-markers failed", err);
    process.exit(1);
  });
}
