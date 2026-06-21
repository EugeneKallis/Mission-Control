import { NextResponse } from "next/server";

export async function POST() {
  // Stub: when Part 11 is built, this will request all agents to update
  try {
    const { db } = await import("@/lib/db");
    await db.serverAgent.updateMany({
      where: {},
      data: { updateRequested: true },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true, note: "No agents to update (stub)" });
  }
}
