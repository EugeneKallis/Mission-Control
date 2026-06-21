import { NextResponse } from "next/server";
import { getHistoryItem } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = await getHistoryItem(Number(id));
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "History item not found" }, { status: 404 });
  }
}
