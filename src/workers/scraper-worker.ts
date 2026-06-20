#!/usr/bin/env bun
/**
 * Scraper task — called by external cron (systemd timer, crontab, etc.)
 *
 * Runs once and exits. The scheduler handles timing.
 *   just run-worker              # quick test
 *   just run-worker src/workers/other.ts
 */

async function main() {
  const now = new Date().toISOString();
  console.log(`[${now}] Hello world — scraper task ran`);
}

main().catch((err) => {
  console.error("Scraper task failed:", err);
  process.exit(1);
});
