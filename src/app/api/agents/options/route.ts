import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { db } = await import("@/lib/db");
    const agents = await db.serverAgent.findMany({
      select: { id: true, hostname: true },
      orderBy: { hostname: "asc" },
    });
    return NextResponse.json(agents);
  } catch {
    return NextResponse.json([]);
  }
}
