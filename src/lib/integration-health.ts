import { resolveConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { getOperationsConfig, checkAdguard } from "@/lib/operations";
import { getClusterSnapshot } from "@/lib/pve-status";
import { PULSE_URL } from "@/lib/pulse";

export type IntegrationState = "healthy" | "error" | "unconfigured";

export interface IntegrationHealthItem {
  id: string;
  category: string;
  name: string;
  state: IntegrationState;
  detail: string;
  latencyMs: number | null;
}

export interface IntegrationHealthSnapshot {
  checkedAt: string;
  items: IntegrationHealthItem[];
  summary: Record<IntegrationState, number>;
}

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: IntegrationHealthSnapshot } | null = null;

export function summarizeIntegrationHealth(items: IntegrationHealthItem[]): Record<IntegrationState, number> {
  return items.reduce<Record<IntegrationState, number>>(
    (counts, item) => ({ ...counts, [item.state]: counts[item.state] + 1 }),
    { healthy: 0, error: 0, unconfigured: 0 },
  );
}

export async function checkHttpIntegration(input: {
  id: string;
  category: string;
  name: string;
  configured: boolean;
  url: string;
  headers?: HeadersInit;
}): Promise<IntegrationHealthItem> {
  if (!input.configured) {
    return { id: input.id, category: input.category, name: input.name, state: "unconfigured", detail: "Not configured", latencyMs: null };
  }

  const started = performance.now();
  try {
    const response = await fetch(input.url, {
      cache: "no-store",
      headers: input.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - started);
    return response.ok
      ? { id: input.id, category: input.category, name: input.name, state: "healthy", detail: `HTTP ${response.status}`, latencyMs }
      : { id: input.id, category: input.category, name: input.name, state: "error", detail: `HTTP ${response.status}`, latencyMs };
  } catch (error) {
    return {
      id: input.id,
      category: input.category,
      name: input.name,
      state: "error",
      detail: error instanceof Error && error.name === "TimeoutError" ? "Timed out" : "Unreachable",
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

export function clearIntegrationHealthCache(): void {
  cache = null;
}

export async function getIntegrationHealth(refresh = false): Promise<IntegrationHealthSnapshot> {
  const now = Date.now();
  if (!refresh && cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const [config, dozzleEndpoints, pve, operationsConfig] = await Promise.all([
    resolveConfig(),
    db.dozzleEndpoint.findMany({ where: { enabled: true }, orderBy: [{ order: "asc" }, { id: "asc" }] }).catch(() => []),
    getClusterSnapshot(),
    getOperationsConfig(),
  ]);

  const checks: Promise<IntegrationHealthItem>[] = config.arrInstances.map((instance) =>
    checkHttpIntegration({
      id: `arr:${instance.name}`,
      category: "Arr",
      name: instance.name,
      configured: Boolean(instance.apiKey),
      url: `${instance.url.replace(/\/+$/, "")}/api/v3/system/status`,
      headers: { "X-Api-Key": instance.apiKey },
    }),
  );

  checks.push(
    checkHttpIntegration({
      id: "plex",
      category: "Media",
      name: "Plex",
      configured: Boolean(config.plexUrl && config.plexToken),
      url: `${config.plexUrl.replace(/\/+$/, "")}/identity`,
      headers: { "X-Plex-Token": config.plexToken, Accept: "application/json" },
    }),
    checkHttpIntegration({
      id: "real-debrid",
      category: "Downloads",
      name: "Real-Debrid",
      configured: Boolean(config.realDebridApiKey),
      url: "https://api.real-debrid.com/rest/1.0/user",
      headers: { Authorization: `Bearer ${config.realDebridApiKey}` },
    }),
    checkHttpIntegration({
      id: "decypharr",
      category: "Downloads",
      name: "Decypharr",
      configured: Boolean(config.decypharrUrl),
      url: `${config.decypharrUrl.replace(/\/+$/, "")}/api/torrents`,
    }),
    checkHttpIntegration({
      id: "pulse",
      category: "Monitoring",
      name: "Pulse",
      configured: true,
      url: `${PULSE_URL}/api/health`,
    }),
    ...dozzleEndpoints.map((endpoint) =>
      checkHttpIntegration({
        id: `dozzle:${endpoint.id}`,
        category: "Logs",
        name: endpoint.name,
        configured: true,
        url: endpoint.apiUrl,
      }),
    ),
  );

  const [httpItems, adguard] = await Promise.all([
    Promise.all(checks),
    checkAdguard(operationsConfig),
  ]);

  const items: IntegrationHealthItem[] = [
    ...httpItems,
    ...pve.endpoints.map((endpoint) => ({
      id: `pve:${endpoint.id}`,
      category: "Virtualization",
      name: endpoint.name,
      state: endpoint.online ? "healthy" as const : "error" as const,
      detail: endpoint.online ? `${endpoint.nodes.length} node${endpoint.nodes.length === 1 ? "" : "s"}` : endpoint.error || "Unreachable",
      latencyMs: null,
    })),
    {
      id: "adguard",
      category: "Network",
      name: "AdGuard Home",
      state: !adguard.configured ? "unconfigured" : adguard.ok ? "healthy" : "error",
      detail: !adguard.configured ? "Not configured" : adguard.ok ? (adguard.protectionEnabled ? "Protection enabled" : "Protection disabled") : adguard.error || "Unreachable",
      latencyMs: null,
    } satisfies IntegrationHealthItem,
  ].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const value: IntegrationHealthSnapshot = {
    checkedAt: new Date().toISOString(),
    items,
    summary: summarizeIntegrationHealth(items),
  };
  cache = { at: Date.now(), value };
  return value;
}
