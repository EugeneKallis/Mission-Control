export const DOZZLE_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
] as const;

export const BACKFILL_STEPS = [100, 300, 1000] as const;
export const DEFAULT_BACKFILL_LINES = BACKFILL_STEPS[0];
export const DOCKER_LOGS_STORAGE_KEY = "mission-control:docker-logs:v1";

export type DozzleLogLevel = (typeof DOZZLE_LOG_LEVELS)[number];

export interface DozzleStat {
  id?: string;
  cpu: number;
  memory: number;
  memoryUsage: number;
  networkRxTotal?: number;
  networkTxTotal?: number;
  diskReadTotal?: number;
  diskWriteTotal?: number;
}

export interface DozzleContainer {
  id: string;
  name: string;
  image: string;
  command?: string;
  created?: string;
  startedAt?: string;
  finishedAt?: string;
  state: string;
  health?: string;
  host: string;
  labels?: Record<string, string>;
  stats?: DozzleStat[] | { data?: DozzleStat[] };
}

export interface DozzleContainerEvent {
  name: string;
  host: string;
  actorId: string;
  actorAttributes?: Record<string, string>;
  time?: string;
}

export interface DozzleLogEvent {
  t?: "single" | "group" | "complex";
  m?: unknown;
  rm?: string;
  ts?: number;
  id?: number;
  l?: string;
  s?: "stdout" | "stderr" | "unknown" | string;
  c?: string;
}

export interface DozzleSearchStatus {
  scannedTo?: string;
  matches: number;
  done: boolean;
  reason?: "exhausted" | "capped" | string;
}

export interface DozzleEndpointConfig {
  id: number;
  name: string;
  apiUrl: string;
  enabled: boolean;
  order: number;
}

export function normalizeDozzleUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Dozzle URL must be a valid http:// or https:// URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dozzle URL must use http:// or https://");
  }
  if (!url.hostname) {
    throw new Error("Dozzle URL must include a hostname");
  }
  return trimmed;
}

/** Build a route below a configured Dozzle base, preserving an optional base path. */
export function buildDozzleEndpointUrl(apiUrl: string, pathname: string): string {
  const base = new URL(`${normalizeDozzleUrl(apiUrl)}/`);
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = `${prefix}/${pathname.replace(/^\/+/, "")}`;
  base.search = "";
  return base.toString();
}

export function buildLogQuery(options: {
  host: string;
  min?: number;
  includeStdout?: boolean;
  includeStderr?: boolean;
  from?: string;
  to?: string;
}): URLSearchParams {
  const query = new URLSearchParams();
  query.set("host", options.host);
  if (options.min !== undefined) query.set("min", String(options.min));
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  if (options.includeStdout !== false) query.set("stdout", "");
  if (options.includeStderr !== false) query.set("stderr", "");
  for (const level of DOZZLE_LOG_LEVELS) query.append("levels", level);
  return query;
}

export function buildProxyLogUrl(
  endpointId: number,
  containerId: string,
  host: string,
  mode: "stream" | "backfill" = "stream",
  min?: number,
  from?: string,
  to?: string,
): string {
  const suffix = mode === "stream" ? "/stream" : "";
  const path = `/api/docker-logs/endpoints/${endpointId}/containers/${encodeURIComponent(containerId)}/logs${suffix}`;
  const query = buildLogQuery({ host, min, from, to });
  return `${path}?${query.toString()}`;
}

export function getStats(data: DozzleContainer["stats"]): DozzleStat[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export function decodeLogMessage(event: DozzleLogEvent): string {
  if (typeof event.m === "string") return event.m;
  if (Array.isArray(event.m)) {
    return event.m
      .map((fragment) => {
        if (fragment && typeof fragment === "object" && "m" in fragment) {
          return String((fragment as { m?: unknown }).m ?? "");
        }
        return String(fragment ?? "");
      })
      .join("\n");
  }
  if (event.m !== undefined) return JSON.stringify(event.m);
  return event.rm ?? "";
}

export function logEventKey(event: DozzleLogEvent, fallbackIndex = 0): string {
  if (typeof event.id === "number") return `id:${event.id}`;
  return `log:${event.ts ?? 0}:${event.s ?? ""}:${decodeLogMessage(event)}:${fallbackIndex}`;
}

export function formatLogTimestamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
