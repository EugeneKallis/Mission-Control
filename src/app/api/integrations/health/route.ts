import { NextResponse } from "next/server";
import { getIntegrationHealth } from "@/lib/integration-health";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const response = NextResponse.json(await getIntegrationHealth(refresh));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("GET /api/integrations/health failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check integrations" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
