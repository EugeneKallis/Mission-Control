import { NextResponse } from "next/server";
import { resolveConfig } from "@/lib/config";
import { PULSE_PUBLIC_ENDPOINTS, PULSE_RESOURCES_PATH, pulsePublicUrl } from "@/lib/pulse";

export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 5_000;
const RESOURCE_PAGE_SIZE = 100;
const RESOURCE_PAGE_LIMIT = 100;

type PulseResult =
  | { path: string; value: unknown }
  | { path: string; error: string };

async function fetchPulseEndpoint(path: string, apiKey?: string): Promise<unknown> {
  const response = await fetch(pulsePublicUrl(path), {
    cache: "no-store",
    headers: path.startsWith(PULSE_RESOURCES_PATH) && apiKey
      ? { "X-API-Token": apiKey }
      : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractResources(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => asRecord(item) !== null);
  }
  const body = asRecord(value);
  if (!body) return [];

  for (const collection of [body.resources, body.items, body.data, body.results]) {
    const resources = extractResources(collection);
    if (resources.length > 0) return resources;
  }
  return [];
}

function totalResources(value: unknown): number | null {
  const body = asRecord(value);
  if (!body) return Array.isArray(value) ? value.length : null;

  for (const total of [body.total, asRecord(body.pagination)?.total, asRecord(body.meta)?.total]) {
    if (typeof total === "number" && Number.isFinite(total)) return total;
  }
  return null;
}

async function fetchAllResources(apiKey: string) {
  const resources: Record<string, unknown>[] = [];
  let reportedTotal: number | null = null;

  for (let page = 1; page <= RESOURCE_PAGE_LIMIT; page += 1) {
    const response = await fetchPulseEndpoint(
      `${PULSE_RESOURCES_PATH}?page=${page}&limit=${RESOURCE_PAGE_SIZE}`,
      apiKey,
    );
    const pageResources = extractResources(response);
    const pageTotal = totalResources(response);
    if (pageTotal !== null) reportedTotal = pageTotal;
    resources.push(...pageResources);

    if (
      pageResources.length === 0
      || pageResources.length < RESOURCE_PAGE_SIZE
      || (reportedTotal !== null && resources.length >= reportedTotal)
    ) {
      break;
    }
  }

  return {
    resources,
    total: reportedTotal ?? resources.length,
  };
}

export async function GET() {
  let apiKey = "";
  try {
    apiKey = (await resolveConfig()).pulseApiKey;
  } catch {
    // Public Pulse health data should still work if config storage is unavailable.
  }

  const publicResults: PulseResult[] = await Promise.all(
    PULSE_PUBLIC_ENDPOINTS.map(async (path): Promise<PulseResult> => {
      try {
        return { path, value: await fetchPulseEndpoint(path) };
      } catch (error) {
        return {
          path,
          error: error instanceof Error ? error.message : "Request failed",
        };
      }
    }),
  );

  let resourceResult: PulseResult = { path: PULSE_RESOURCES_PATH, value: null };
  if (apiKey) {
    try {
      resourceResult = { path: PULSE_RESOURCES_PATH, value: await fetchAllResources(apiKey) };
    } catch (error) {
      resourceResult = {
        path: PULSE_RESOURCES_PATH,
        error: error instanceof Error ? error.message : "Request failed",
      };
    }
  }

  const results = [...publicResults, resourceResult];
  const byPath = new Map(results.map((result) => [result.path, result]));
  const valueFor = (path: string) => {
    const result = byPath.get(path);
    return result && "value" in result ? result.value : null;
  };
  const resourcesValue = valueFor(PULSE_RESOURCES_PATH);
  const resourcesBody = asRecord(resourcesValue);
  const resources = resourcesBody?.resources ?? [];
  const payload = {
    fetchedAt: new Date().toISOString(),
    health: valueFor("/api/health"),
    version: valueFor("/api/version"),
    security: valueFor("/api/security/status"),
    resources: Array.isArray(resources) ? resources : [],
    resourceCount: resourcesBody?.total ?? null,
    authenticated: Boolean(apiKey),
    resourcesError: "error" in resourceResult ? resourceResult.error : null,
    errors: results.flatMap((result) => ("error" in result ? [`${result.path}: ${result.error}`] : [])),
  };

  const hasData = payload.health !== null || payload.version !== null || payload.security !== null;
  return NextResponse.json(payload, {
    status: hasData ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
