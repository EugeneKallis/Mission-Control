import { AppShell } from "@/components/layout/app-shell";
import { BlFinderPage } from "@/components/bl-finder/bl-finder-page";

/**
 * /database/bl-finder
 *
 * Page shell (server component) — the actual UI lives in
 * `<BlFinderPage />` (client). The page is force-dynamic so the first
 * server render reflects the latest table state; the client polls
 * /api/bl-finder every 5s while visible to stay current.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell noScroll>
      <BlFinderPage />
    </AppShell>
  );
}
