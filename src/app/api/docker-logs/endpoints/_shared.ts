import { getDozzleEndpoint } from "@/lib/db/queries";
import {
  DOZZLE_LOG_LEVELS,
  buildDozzleEndpointUrl,
  normalizeDozzleUrl,
} from "@/lib/docker-logs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FORWARDED_LOG_PARAMS = new Set([
  "min",
  "from",
  "to",
  "stdout",
  "stderr",
  "levels",
  "filter",
  "inverse",
  "jsonOnly",
  "everything",
  "maxStart",
  "lastSeenId",
  "startId",
]);

export function parseEndpointId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type DozzleEndpoint = NonNullable<Awaited<ReturnType<typeof getDozzleEndpoint>>>;

export async function endpointResponse(rawId: string): Promise<
  | { endpoint: DozzleEndpoint }
  | { response: NextResponse }
> {
  const id = parseEndpointId(rawId);
  if (id === null) {
    return { response: NextResponse.json({ error: "Invalid endpoint id" }, { status: 400 }) };
  }

  const endpoint = await getDozzleEndpoint(id);
  if (!endpoint) {
    return { response: NextResponse.json({ error: "Endpoint not found" }, { status: 404 }) };
  }

  return { endpoint };
}

export function buildUpstreamLogUrl(
  apiUrl: string,
  host: string,
  containerId: string,
  mode: "logs" | "logs/stream",
  requestUrl: string,
): string {
  const upstream = new URL(buildDozzleEndpointUrl(
    normalizeDozzleUrl(apiUrl),
    `/api/hosts/${encodeURIComponent(host)}/containers/${encodeURIComponent(containerId)}/${mode}`,
  ));
  const source = new URL(requestUrl);
  const params = new URLSearchParams();
  for (const [key, value] of source.searchParams) {
    if (key === "host") continue;
    if (FORWARDED_LOG_PARAMS.has(key)) params.append(key, value);
  }

  // Dozzle's stream filter only treats the request as "all logs" when every
  // supported level is present. Supplying the canonical set also keeps plain
  // text containers visible instead of silently filtering them out.
  if (!params.has("levels")) {
    for (const level of DOZZLE_LOG_LEVELS) params.append("levels", level);
  }

  if (!params.has("stdout") && !params.has("stderr")) {
    params.set("stdout", "");
    params.set("stderr", "");
  }

  upstream.search = params.toString();
  return upstream.toString();
}

export async function proxyDozzle(
  request: Request,
  upstreamUrl: string,
  contentType: "event-stream" | "jsonl",
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: {
        Accept: contentType === "event-stream" ? "text/event-stream" : "application/x-jsonl",
        // Dozzle can gzip SSE. Identity makes a byte-for-byte stream pipe
        // safe and avoids forwarding Content-Encoding without decompressing.
        "Accept-Encoding": "identity",
      },
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    console.error("Failed to reach Dozzle:", error);
    return NextResponse.json({ error: "Dozzle endpoint unavailable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Dozzle endpoint unavailable" }, { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ??
      (contentType === "event-stream" ? "text/event-stream" : "application/x-jsonl; charset=UTF-8"),
  );
  headers.set("Cache-Control", contentType === "event-stream" ? "no-cache, no-transform" : "no-store");
  headers.set("X-Accel-Buffering", "no");
  headers.set("Connection", "keep-alive");

  return new Response(upstream.body, { status: 200, headers });
}
