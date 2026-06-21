import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Use raw SQL to get table list from SQLite
    const result = await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'prisma_%' AND name != '_prisma_migrations' ORDER BY name"
    );
    const tables = result.map((r) => r.name);
    return NextResponse.json({ tables });
  } catch (error) {
    console.error("Failed to list tables:", error);
    return NextResponse.json({ error: "Failed to list tables" }, { status: 500 });
  }
}
