/**
 * /migrate — import macros, macro groups, and scrape results from an
 * existing ServerTool SQLite database. Not in the sidebar; reached
 * directly via URL.
 */

import { AppShell } from "@/components/layout/app-shell";
import { MigratePage } from "@/components/migrate/migrate-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <MigratePage />
    </AppShell>
  );
}
