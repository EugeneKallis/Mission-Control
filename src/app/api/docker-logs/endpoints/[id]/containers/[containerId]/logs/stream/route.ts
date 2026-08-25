import { NextResponse } from "next/server";
import { buildUpstreamLogUrl, endpointResponse, proxyDozzle } from "../../../../../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; containerId: string }> }) {
  const { id, containerId } = await params;
  const result = await endpointResponse(id);
  if ("response" in result) return result.response;

  const host = new URL(request.url).searchParams.get("host")?.trim();
  if (!host) return NextResponse.json({ error: "Dozzle host is required" }, { status: 400 });

  const upstreamUrl = buildUpstreamLogUrl(result.endpoint.apiUrl, host, containerId, "logs/stream", request.url);
  return proxyDozzle(request, upstreamUrl, "event-stream");
}
