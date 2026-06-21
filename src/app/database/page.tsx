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
        <h1 className="text-2xl font-bold mb-8 tracking-tight text-[#E5E2E1]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Database Tables
        </h1>
        {tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#849587] gap-3">
            <span className="material-symbols-outlined text-4xl">database</span>
            <p>No tables found or database unavailable.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tables.map((table) => (
              <Link
                key={table}
                href={`/database/${table}`}
                className="block p-4 rounded-lg transition-all duration-200 hover:scale-[1.02]"
                style={{
                  background: "#201F1F",
                  border: "1px solid rgba(59, 75, 63, 0.3)",
                  color: "#E5E2E1",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#618B6B]">table</span>
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
