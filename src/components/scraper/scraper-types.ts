/**
 * Client-side shape for the scraper UI. The API returns rows shaped this
 * way (snake_case) so the component code reads naturally.
 */

export interface ScrapeResultView {
  id: number;
  source: string;
  title: string;
  image: string | null;
  images: string[];
  magnet: string | null;
  torrent: string | null;
  tags: string[];
  is_downloaded: boolean;
  is_hidden: boolean;
  created_at: string | null;
}

export type ScraperSource = "141jav" | "pornrips";

export interface ScrapeResultsCursor {
  createdAt: string;
  id: number;
}

export interface ScrapeResultsPage {
  results: ScrapeResultView[];
  counts: Partial<Record<ScraperSource, number>>;
  nextCursor: ScrapeResultsCursor | null;
}

export const SOURCES: ScraperSource[] = ["141jav", "pornrips"];

export function isValidSource(value: string | null | undefined): value is ScraperSource {
  return value === "141jav" || value === "pornrips";
}
