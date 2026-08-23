import { NextResponse } from "next/server";
import { getArrDriftReport } from "@/lib/arr-drift";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const baseline = new URL(request.url).searchParams.get("baseline") ?? undefined;
    const response = NextResponse.json(await getArrDriftReport(baseline));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("GET /api/arr-drift failed:", error);
    return NextResponse.json({ error: "Failed to compare Arr configuration" }, { status: 500 });
  }
}
