import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Stub: when Part 11 is built, this will request a specific agent to restart
  try {
    const { db } = await import("@/lib/db");
    await db.serverAgent.update({
      where: { id: Number(id) },
      data: { restartRequested: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to request restart:", error);
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
}
