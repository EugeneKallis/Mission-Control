#!/usr/bin/env bun
/**
 * Scraper orchestrator.
 *
 * Runs the requested source (or all three) once and exits. The
 * `withScrapingStatus` helper toggles a `settings` row that the web
 * `/api/scraper/status` endpoint reads, so the page's "Scraping…" spinner
 * reflects what's actually happening — even when this worker is a separate
 * process from the web server.
 *
 *   just run-worker                            # all three
 *   just run-worker src/workers/scraper-runner.ts -- 141jav
 *   just run-worker src/workers/scraper-runner.ts -- projectjav
 *   just run-worker src/workers/scraper-runner.ts -- pornrips
 *
 * A 20-day-old hidden-result cleanup runs at the start of every invocation,
 * matching the Go implementation.
 */

import { cleanOldScrapeResults } from "@/lib/db/queries";
import { withScrapingStatus } from "./scrapers/status";
import { run141JavScrape } from "./scrapers/141jav";
import { runProjectJAVScrape } from "./scrapers/projectjav";
import { runPornRipsScrape } from "./scrapers/pornrips";

type Source = "141jav" | "projectjav" | "pornrips";
const SOURCES: Source[] = ["141jav", "projectjav", "pornrips"];

function parseTargets(argv: string[]): Source[] {
  const args = argv.slice(2);
  if (args.length === 0) return SOURCES;
  return args.filter((a): a is Source =>
    (SOURCES as string[]).includes(a)
  );
}

/** Public for testing. */
export const __parseTargets = parseTargets;

async function runOne(source: Source): Promise<void> {
  await withScrapingStatus(source, async () => {
    const started = Date.now();
    console.log(`\n=== ${source} starting ===`);
    try {
      switch (source) {
        case "141jav":
          await run141JavScrape();
          break;
        case "projectjav":
          await runProjectJAVScrape();
          break;
        case "pornrips":
          await runPornRipsScrape();
          break;
      }
    } catch (err) {
      console.error(`[${source}] scrape failed:`, err);
    } finally {
      const ms = Date.now() - started;
      console.log(`=== ${source} done in ${ms}ms ===\n`);
    }
  });
}

export async function runAllSources(): Promise<void> {
  const startedAt = new Date();
  console.log(`[scraper-runner] start at ${startedAt.toISOString()}`);

  // Clean up hidden scrape results older than 20 days (matches the Go runner)
  try {
    const result = await cleanOldScrapeResults();
    console.log(`[scraper-runner] cleanup — removed ${result.count} stale hidden results`);
  } catch (err) {
    console.warn("[scraper-runner] cleanup failed:", err);
  }

  const targets = parseTargets(process.argv);
  if (targets.length === 0) {
    console.error(`[scraper-runner] no valid sources in args: ${process.argv.slice(2).join(" ")}`);
    process.exit(1);
  }

  console.log(`[scraper-runner] sources: ${targets.join(", ")}`);

  // Run sequentially. The original Go runner is also sequential per-source; running
  // them in parallel would just thrash the source sites.
  for (const src of targets) {
    await runOne(src);
  }

  const totalMs = Date.now() - startedAt.getTime();
  console.log(`[scraper-runner] total ${totalMs}ms`);
}

/**
 * Trigger a single source in the background. Used by the API endpoints
 * (`/api/scraper/trigger` etc.) so the web request returns immediately and
 * the scrape runs detached. Sets the status flag the page polls for, then
 * forks the actual scrape without awaiting it.
 */
export function triggerSourceInBackground(source: Source): void {
  // We can't await this in the API path — the worker runs in its own
  // promise and the response returns straight away. The status flag is
  // already set by withScrapingStatus once the scrape actually starts.
  void runOne(source).catch((err) => {
    console.error(`[scraper-runner] background ${source} failed:`, err);
  });
}

/**
 * Trigger every source in the background. Used by `POST /api/scraper/trigger-all`.
 */
export function triggerAllSourcesInBackground(): void {
  for (const src of SOURCES) {
    triggerSourceInBackground(src);
  }
}

// Only run main() when invoked directly (not when imported by scraper-worker.ts)
if (import.meta.main) {
  runAllSources().catch((err) => {
    console.error("[scraper-runner] fatal:", err);
    process.exit(1);
  });
}
