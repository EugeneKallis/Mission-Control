import { AppShell } from "@/components/layout/app-shell";
import { ScraperPage } from "@/components/scraper/scraper-page";
import { isValidSource, type ScraperSource } from "@/components/scraper/scraper-types";

/**
 * The page's ?source= query drives the active tab. Default is "141jav" to
 * match the Go server's behavior. Server component reads the query so deep
 * links work; the client component handles tab switching after mount.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp.source;
  const initialSource: ScraperSource = isValidSource(requested) ? requested : "141jav";

  return (
    <AppShell noScroll>
      <ScraperPage initialSource={initialSource} />
    </AppShell>
  );
}
