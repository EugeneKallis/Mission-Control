/**
 * Cross-process scraping status, backed by the `settings` table.
 *
 * The original Go implementation used an in-process mutex because the
 * scraper ran in the same process as the web server. Mission Control splits
 * the scraper into a separate worker process — the web page polls
 * `/api/scraper/status` and the worker writes the flag, so they need a
 * shared store. The `settings` table is already used for global config and
 * gives us atomic upsert via Prisma.
 *
 * Layout: one row per source, with a JSON-encoded body that includes a
 * `set_at` timestamp so the read path can detect stale flags. This matters
 * because `withScrapingStatus`'s `finally` only runs on graceful exits —
 * if the worker is killed (SIGKILL, OOM, the systemd timeout) the flag would
 * stay `true` forever and the page would spin forever. We treat any flag
 * older than STALE_AFTER_MS as `false` and clear it.
 */

import { db } from "@/lib/db";

const SETTING_KEY_PREFIX = "scraper_status:";

/** A flag older than this is treated as stale and ignored. */
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

interface ScraperStatusBody {
  is_scraping: boolean;
  set_at: number; // epoch ms
}

function keyFor(source: string): string {
  return `${SETTING_KEY_PREFIX}${source}`;
}

function isStale(body: ScraperStatusBody): boolean {
  if (!body.is_scraping) return false;
  return Date.now() - body.set_at > STALE_AFTER_MS;
}

export async function getScrapingStatus(source: string): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: keyFor(source) } });
  if (!row?.value) return false;
  let body: ScraperStatusBody;
  try {
    body = JSON.parse(row.value) as ScraperStatusBody;
  } catch {
    return false;
  }
  if (isStale(body)) {
    // Best-effort clear so the next read is fast and the next worker write
    // doesn't race with a still-stale read.
    await setScrapingStatus(source, false).catch(() => {});
    return false;
  }
  return Boolean(body.is_scraping);
}

export async function getAllScrapingStatuses(): Promise<Record<string, boolean>> {
  const rows = await db.setting.findMany({
    where: { key: { startsWith: SETTING_KEY_PREFIX } },
  });
  const out: Record<string, boolean> = {};
  for (const row of rows) {
    const source = row.key.slice(SETTING_KEY_PREFIX.length);
    if (!row.value) {
      out[source] = false;
      continue;
    }
    let body: ScraperStatusBody;
    try {
      body = JSON.parse(row.value) as ScraperStatusBody;
    } catch {
      out[source] = false;
      continue;
    }
    if (isStale(body)) {
      await setScrapingStatus(source, false).catch(() => {});
      out[source] = false;
      continue;
    }
    out[source] = Boolean(body.is_scraping);
  }
  return out;
}

export async function setScrapingStatus(source: string, isScraping: boolean): Promise<void> {
  const body: ScraperStatusBody = { is_scraping: isScraping, set_at: Date.now() };
  await db.setting.upsert({
    where: { key: keyFor(source) },
    update: { value: JSON.stringify(body) },
    create: { key: keyFor(source), value: JSON.stringify(body) },
  });
}

/**
 * Set the flag, run the scraper, and clear the flag — even on error.
 * The web page polls `/api/scraper/status?source=` and stops showing the
 * "Scraping…" spinner once it returns false.
 *
 * If the process is killed before the `finally` runs (SIGKILL, OOM, systemd
 * timeout), the `set_at` timestamp lets the read path detect and clear the
 * stale flag automatically — see `getScrapingStatus` above.
 */
export async function withScrapingStatus<T>(
  source: string,
  fn: () => Promise<T>
): Promise<T> {
  await setScrapingStatus(source, true);
  try {
    return await fn();
  } finally {
    await setScrapingStatus(source, false);
  }
}
