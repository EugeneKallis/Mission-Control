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
 * Layout: one row per source, with a JSON-encoded body that can grow to
 * include timing / last-error fields if we need them later. Today it just
 * stores `{ is_scraping: boolean }`.
 */

import { db } from "@/lib/db";

const SETTING_KEY_PREFIX = "scraper_status:";

interface ScraperStatusBody {
  is_scraping: boolean;
}

function keyFor(source: string): string {
  return `${SETTING_KEY_PREFIX}${source}`;
}

export async function getScrapingStatus(source: string): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: keyFor(source) } });
  if (!row?.value) return false;
  try {
    const body = JSON.parse(row.value) as ScraperStatusBody;
    return Boolean(body.is_scraping);
  } catch {
    return false;
  }
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
    try {
      const body = JSON.parse(row.value) as ScraperStatusBody;
      out[source] = Boolean(body.is_scraping);
    } catch {
      out[source] = false;
    }
  }
  return out;
}

export async function setScrapingStatus(source: string, isScraping: boolean): Promise<void> {
  const body: ScraperStatusBody = { is_scraping: isScraping };
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
