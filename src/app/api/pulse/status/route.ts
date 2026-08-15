import { NextResponse } from "next/server";
import { resolveConfig } from "@/lib/config";
import { PULSE_PUBLIC_ENDPOINTS, PULSE_RESOURCES_PATH, pulsePublicUrl } from "@/lib/pulse";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 5_000;

async function fetchPulseEndpoint(path: string, apiKey?: string): Promise<unknown> {
  const response = await fetch(pulsePublicUrl(path), {
    cache: "no-store",
    headers: path === PULSE_RESOURCES_PATH && apiKey ? { "X-API-Token": apiKey } : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function countResources(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return null;

  const body = value as {
    total?: unknown;
    resources?: unknown;
    items?: unknown;
    data?: unknown;
    pagination?: { total?: unknown };
    meta?: { total?: unknown };
  };
  for (const total of [body.total, body.pagination?.total, body.meta?.total]) {
    if (typeof total === "number" && Number.isFinite(total)) return total;
  }
  for (const collection of [body.resources, body.items, body.data]) {
    const count = countResources(collection);
    if (count !== null) return count;
  }
  return null;
}

export async function GET() {
  let apiKey = "";
  try {
    apiKey = (await resolveConfig()).pulseApiKey;
  } catch {
    // Public Pulse health data should still work if config storage is unavailable.
  }

  const paths = apiKey ? [...PULSE_PUBLIC_ENDPOINTS, PULSE_RESOURCES_PATH] : [...PULSE_PUBLIC_ENDPOINTS];
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        return { path, value: await fetchPulseEndpoint(path, apiKey || undefined) };
      } catch (error) {
        return {
          path,
          error: error instanceof Error ? error.message : "Request failed",
        };
      }
    }),
  );

  const byPath = new Map(results.map((result) => [result.path, result]));
  const resourceResult = byPath.get(PULSE_RESOURCES_PATH);
  const resources = resourceResult && "value" in resourceResult ? resourceResult.value : null;
  const payload = {
    fetchedAt: new Date().toISOString(),
    health: byPath.get("/api/health")?.value ?? null,
    version: byPath.get("/api/version")?.value ?? null,
    security: byPath.get("/api/security/status")?.value ?? null,
    resourceCount: countResources(resources),
    authenticated: Boolean(apiKey),
    resourcesError: resourceResult && "error" in resourceResult ? resourceResult.error : null,
    errors: results.flatMap((result) => ("error" in result ? [`${result.path}: ${result.error}`] : [])),
  };

  const hasData = payload.health !== null || payload.version !== null || payload.security !== null;
  return NextResponse.json(payload, {
    status: hasData ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
