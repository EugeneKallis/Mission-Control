export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { db } from "@/lib/db";

export default async function DatabasePage() {
  let tables: string[] = [];

  try {
    const result = await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'prisma_%' AND name != '_prisma_migrations' ORDER BY name"
    );
    tables = result.map((r) => r.name);
  } catch (error) {
    console.error("Failed to list tables:", error);
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto w-full stagger-1 p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-8 tracking-tight text-on-surface font-display">
          Database Tables
        </h1>

        {/* Pinned feature card — also linked from the sidebar. */}
        <Link
          href="/database/bl-finder"
          className="block mb-6 p-4 rounded-[var(--radius-card)] transition-all duration-200 hover:scale-[1.01] bg-amber-950/20 border border-amber-500/30 text-on-surface"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-400">broken_image</span>
            <div className="flex-1">
              <div className="font-semibold">BL Finder</div>
              <div className="text-xs italic mt-0.5 text-on-surface-variant">
                Media file readability checks — broken symlinks, corrupt files, webdav unreadable
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              chevron_right
            </span>
          </div>
        </Link>
        {tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-4xl">database</span>
            <p>No tables found or database unavailable.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tables.map((table) => (
              <Link
                key={table}
                href={`/database/${table}`}
                className="block p-4 rounded-[var(--radius-card)] transition-all duration-200 hover:scale-[1.02] bg-surface border border-outline-variant/30 text-on-surface"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">table</span>
                  <span className="font-mono text-sm">{table}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
