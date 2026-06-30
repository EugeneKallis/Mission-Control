#!/usr/bin/env bun
/**
 * broken-link-checker — long-running media readability poller.
 *
 * Continuously probes media symlinks under MEDIA_BASE_PATH and records
 * the result in the `file_checks` table. The page at
 * `/database/bl-finder` reads the table; the worker doesn't need any
 * other process to be running.
 *
 * Each tick does:
 *   1. Throttled discovery (every `discoverIntervalSec`) — walk each
 *      configured media dir, upsert one row per media symlink.
 *   2. Reset `checking` rows older than the probe timeout back to
 *      `pending` (handles a worker that died mid-probe).
 *   3. Pick the next `batchSize` due rows and run `probeFileReadable`
 *      with bounded `concurrency` and a small inter-file delay (webdav
 *      rate-limiting).
 *   4. Update each row with the result.
 *   5. Update `blfinder_status` so the page spinner / counters stay live.
 *
 * Config is read at startup and on every tick from the `settings` table
 * (so editing it in the page takes effect within one tick without a
 * restart). CLI flags override the stored config.
 *
 *   just run-worker src/workers/broken-link-checker.ts
 *   just run-worker src/workers/broken-link-checker.ts -- --once
 *   just run-worker src/workers/broken-link-checker.ts -- --batch-size 10
 *
 * Runs forever unless `--once` is passed; stop with SIGINT/SIGTERM.
 */

import { discoverFiles, probeFileReadable } from "@/lib/broken-link";
import {
  getBlFinderConfig,
  getBlFinderStatus,
  pickFilesDueForCheck,
  resetStaleChecking,
  setBlFinderStatus,
  setFileCheckResult,
  upsertFileCheck,
  markFileChecking,
  logBlFinder,
  type BlFinderConfig,
} from "@/lib/db/queries";
import { parseArgs } from "../../scripts/_lib/cli";
import { banner, info, warn } from "../../scripts/_lib/log";

const DEFAULT_INTERVAL_S = 60;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_S = 30;
const DEFAULT_RECHECK_AGE_DAYS = 7;
const DEFAULT_DISCOVER_INTERVAL_S = 30 * 60;
const INTER_FILE_DELAY_MS = 500; // be gentle on webdav

export interface BlFinderPassResult {
  discovered: number;
  checked: number;
  ok: number;
  broken: number;
  error: string | null;
}

export async function main() {
  const args = parseArgs({
    interval: { type: "number", default: 0 },
    "batch-size": { type: "number", default: 0 },
    concurrency: { type: "number", default: 0 },
    timeout: { type: "number", default: 0 },
    "recheck-age-days": { type: "number", default: 0 },
    "discover-interval": { type: "number", default: 0 },
    once: { type: "boolean", default: false },
    "scan-only": { type: "boolean", default: false },
    "check-only": { type: "boolean", default: false },
  });

  banner("broken-link-checker");

  const shutdown = async (sig: string) => {
    info(`Received ${sig}, exiting.`);
    await setBlFinderStatus({ running: false }).catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let lastDiscoverAt = 0;

  if (args.once) {
    const result = await pollOnce({
      intervalSec: args.interval || DEFAULT_INTERVAL_S,
      batchSize: args["batch-size"] || DEFAULT_BATCH_SIZE,
      concurrency: args.concurrency || DEFAULT_CONCURRENCY,
      timeoutSec: args.timeout || DEFAULT_TIMEOUT_S,
      recheckAgeDays: args["recheck-age-days"] || DEFAULT_RECHECK_AGE_DAYS,
      discoverIntervalSec: 0,
      mediaDirs: [],
      forceDiscover: true,
      scanOnly: args["scan-only"],
      checkOnly: args["check-only"],
    });
    info(
      `single pass — discovered=${result.discovered}, checked=${result.checked}, ok=${result.ok}, broken=${result.broken}` +
        (result.error ? ` (error: ${result.error})` : ""),
    );
    return;
  }

  while (true) {
    const config = await getBlFinderConfig();
    const cliOverrides: Partial<BlFinderConfig> = {
      ...(args.interval ? { intervalSec: args.interval } : {}),
      ...(args["batch-size"] ? { batchSize: args["batch-size"] } : {}),
      ...(args.concurrency ? { concurrency: args.concurrency } : {}),
      ...(args.timeout ? { timeoutSec: args.timeout } : {}),
      ...(args["recheck-age-days"] ? { recheckAgeDays: args["recheck-age-days"] } : {}),
      ...(args["discover-interval"] ? { discoverIntervalSec: args["discover-interval"] } : {}),
    };
    const effective: BlFinderConfig = { ...config, ...cliOverrides };

    // Check if the page signalled a forced wake (from trigger-scan).
    let forceWake = false;
    try {
      const st = await getBlFinderStatus();
      if (st.forceWakeAt && Date.now() < st.forceWakeAt) {
        forceWake = true;
        // Clear the flag so it only fires once.
        await setBlFinderStatus({ forceWakeAt: null }).catch(() => {});
      }
    } catch { /* ignore */ }

    const isDiscoverTime = forceWake || (Date.now() - lastDiscoverAt > effective.discoverIntervalSec * 1000);

    try {
      const result = await pollOnce({
        intervalSec: effective.intervalSec,
        batchSize: effective.batchSize,
        concurrency: effective.concurrency,
        timeoutSec: effective.timeoutSec,
        recheckAgeDays: effective.recheckAgeDays,
        discoverIntervalSec: effective.discoverIntervalSec,
        mediaDirs: effective.mediaDirs,
        forceDiscover: isDiscoverTime,
        scanOnly: args["scan-only"],
        checkOnly: args["check-only"],
      });
      if (result.discovered > 0) lastDiscoverAt = Date.now();
    } catch (err) {
      warn(`Pass failed: ${(err as Error).message}`);
    }

    const live = await getBlFinderConfig().catch(() => null);
    const intervalSec = live?.intervalSec ?? effective.intervalSec;
    await sleep(Math.max(1, intervalSec) * 1000);
  }
}

export interface PollOnceOptions {
  intervalSec: number;
  batchSize: number;
  concurrency: number;
  timeoutSec: number;
  recheckAgeDays: number;
  discoverIntervalSec: number;
  mediaDirs: string[];
  forceDiscover: boolean;
  scanOnly?: boolean;
  checkOnly?: boolean;
}

/**
 * Run one discovery + check pass. Public for tests. Returns counts; never
 * throws — errors are returned in the result and logged via warn().
 */
export async function pollOnce(opts: PollOnceOptions): Promise<BlFinderPassResult> {
  const result: BlFinderPassResult = { discovered: 0, checked: 0, ok: 0, broken: 0, error: null };

  // Read live config and check enabled. If the worker is disabled, return
  // immediately (the status spinner stays off). The config is re-read here
  // (not from opts) so the UI toggle takes effect within one tick interval.
  const liveConfig = await getBlFinderConfig().catch(() => null);
  if (liveConfig && !liveConfig.enabled && !opts.forceDiscover) {
    return result;
  }

  await setBlFinderStatus({ running: true, error: null });

  try {
    // 1. Discovery (unless --check-only)
    if (!opts.checkOnly && opts.forceDiscover) {
      try {
        const seeds = await discoverFiles({
          // Hardcoded to /mnt/debrid/media/special — the BL Finder only
          // checks the special directory, not movies/tv/etc.
          basePath: "/mnt/debrid/media",
          mediaDirs: ["special"],
        });
        for (const s of seeds) {
          await upsertFileCheck({
            filePath: s.filePath,
            mediaDir: s.mediaDir,
            fileSize: s.fileSize,
          });
        }
        result.discovered = seeds.length;
        info(`discovered ${seeds.length} media symlink(s)`);
        void logBlFinder("info", `discovered ${seeds.length} media symlink(s)`);
      } catch (err) {
        warn(`Discovery failed: ${(err as Error).message}`);
        void logBlFinder("warn", `Discovery failed: ${(err as Error).message}`);
        result.error = `discovery: ${(err as Error).message}`;
      }
    }

    if (opts.scanOnly) {
      return result;
    }

    // 2. Reset stuck `checking` rows.
    const graceMs = opts.timeoutSec * 1000 + 30_000;
    await resetStaleChecking(graceMs).catch((err) => {
      warn(`resetStaleChecking failed: ${(err as Error).message}`);
      void logBlFinder("warn", `resetStaleChecking failed: ${(err as Error).message}`);
    });

    // 3. Pick + probe a batch.
    const due = await pickFilesDueForCheck(opts.batchSize, opts.recheckAgeDays);
    if (due.length === 0) {
      info("no files due for check");
      return result;
    }
    void logBlFinder("info", `checking ${due.length} file(s) (concurrency=${opts.concurrency}, timeout=${opts.timeoutSec}s)`);
    info(`checking ${due.length} file(s) (concurrency=${opts.concurrency}, timeout=${opts.timeoutSec}s)`);

    // Mark all as checking first. If the worker dies between the mark
    // and the result write, resetStaleChecking flips them back to
    // `pending` on the next pass.
    await Promise.all(
      due.map((d) =>
        markFileChecking(d.id).catch((err) => {
          warn(`markFileChecking(${d.id}) failed: ${(err as Error).message}`);
        }),
      ),
    );

    // 4. Probe with bounded concurrency + inter-file delay.
    const queue = [...due];
    const workers = Array.from(
      { length: Math.min(opts.concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          // Inter-file delay to spread I/O. Bounded by concurrency
          // anyway, but the extra spacing is gentler on webdav.
          await sleep(INTER_FILE_DELAY_MS);
          const probe = await probeFileReadable(next.filePath, opts.timeoutSec);
          try {
            await setFileCheckResult(next.id, {
              ok: probe.ok,
              error: probe.error ?? null,
            });
            result.checked++;
            if (probe.ok) result.ok++;
            else result.broken++;
            void logBlFinder("info", `checked ${next.filePath} → ${probe.ok ? "ok" : "broken"} (${probe.elapsedMs}ms)`);
          } catch (err) {
            warn(`setFileCheckResult(${next.id}) failed: ${(err as Error).message}`);
            void logBlFinder("warn", `setFileCheckResult(${next.id}) failed: ${(err as Error).message}`);
          }
        }
      },
    );
    await Promise.all(workers);
  } catch (err) {
    result.error = (err as Error).message;
    warn(`Pass error: ${result.error}`);
    void logBlFinder("error", `Pass error: ${result.error}`);
  } finally {
    await setBlFinderStatus({
      running: false,
      lastPassAt: Date.now(),
      processed: result.checked,
      ok: result.ok,
      broken: result.broken,
      error: result.error,
    }).catch(() => {});
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.main) {
  main().catch((err) => {
    warn(`broken-link-checker failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
