#!/usr/bin/env bun
/**
 * Scraper task — called by external cron (systemd timer, crontab, etc.)
 *
 * Thin shim around `scraper-runner.ts` that runs all three sources. The
 * systemd timer unit (`mission-control-scraper.timer`) calls this script on
 * its 30-minute interval.
 *
 * For manual one-off runs of a single source:
 *   just run-worker src/workers/scraper-runner.ts -- 141jav
 *   just run-worker src/workers/scraper-runner.ts -- projectjav
 *   just run-worker src/workers/scraper-runner.ts -- pornrips
 */

import { runAllSources } from "./scraper-runner";

/**
 * Entrypoint for the systemd-timer scraper task. Runs every source
 * sequentially. Exported so tests can call it directly (and mock
 * `runAllSources`).
 */
export async function main(): Promise<void> {
  await runAllSources();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Scraper task failed:", err);
    process.exit(1);
  });
}
