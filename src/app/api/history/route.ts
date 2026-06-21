import { NextResponse } from "next/server";
import { getHistory, deleteAllHistory } from "@/lib/db/queries";

export async function GET() {
  try {
    const history = await getHistory();
    return NextResponse.json(history);
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteAllHistory();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear history:", error);
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
  }
}
