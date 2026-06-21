import { NextRequest, NextResponse } from "next/server";
import { searchNzbFiles } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    if (q.trim() === "") {
      return NextResponse.json([]);
    }
    const results = await searchNzbFiles(q.trim(), 200);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to search NZB files:", error);
    return NextResponse.json(
      { error: "Failed to search NZB files" },
      { status: 500 }
    );
  }
}
