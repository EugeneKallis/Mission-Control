import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Stub: when Part 11 is built, this will request a specific agent to update
  try {
    const { db } = await import("@/lib/db");
    await db.serverAgent.update({
      where: { id: Number(id) },
      data: { updateRequested: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to request update:", error);
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
}
