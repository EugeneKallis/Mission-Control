import { endpointResponse, proxyDozzle } from "../../../_shared";
import { buildDozzleEndpointUrl } from "@/lib/docker-logs";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await endpointResponse(id);
  if ("response" in result) return result.response;

  const upstreamUrl = buildDozzleEndpointUrl(result.endpoint.apiUrl, "/api/events/stream");
  return proxyDozzle(request, upstreamUrl, "event-stream");
}
