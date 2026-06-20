#!/usr/bin/env npx tsx
/**
 * Scraper Worker — long-running background process
 *
 * Runs indefinitely, executing a task on a loop.
 * Start with:  just run-worker src/workers/scraper-worker.ts
 * Production:  managed by systemd or PM2
 */

const INTERVAL_MS = 60_000; // 1 minute

async function runTask() {
  const now = new Date().toISOString();
  console.log(`[${now}] Hello world — worker tick`);
}

async function main() {
  console.log("Worker started. Press Ctrl+C to stop.");

  // Run immediately on start
  await runTask();

  // Then repeat every INTERVAL_MS
  setInterval(runTask, INTERVAL_MS);
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
