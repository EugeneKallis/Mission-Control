import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { isIP } from "node:net";
import { connect } from "node:tls";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { RELEASE_RADAR_REPOS } from "@/lib/release-radar";

export const OPERATIONS_CONFIG_KEY = "operations:config:v1";
export const OPERATIONS_STATE_KEY = "operations:state:v1";
export const DEFAULT_RELEASE_REPOS = RELEASE_RADAR_REPOS;
export type OperationsSource = "deployments" | "releases" | "adguard" | "tls" | "pve" | "logs" | "blfinder" | "energy";



export interface TlsTarget {
  name: string;
  host: string;
  port: number;
}

export interface OperationsConfig {
  githubRepos: string[];
  adguardUrl: string;
  adguardUsername: string;
  adguardPassword: string;
  tlsTargets: TlsTarget[];
}

export interface PublicOperationsConfig extends Omit<OperationsConfig, "adguardPassword"> {
  hasAdguardPassword: boolean;
}

export interface ReleaseStatus {
  repo: string;
  tag: string;
  url: string;
  publishedAt: string;
  acknowledged: boolean;
  error?: string;
}


export interface DeploymentRecord {
  timestamp: string;
  status: "started" | "success" | "failed";
  sha: string;
  subject: string;
  url?: string;
  stage: string;
  durationSeconds?: number;
}

export interface AdguardStatus {
  configured: boolean;
  ok: boolean;
  protectionEnabled?: boolean;
  dnsQueries?: number;
  blockedFiltering?: number;
  blockedPercent?: number;
  averageProcessingMs?: number;
  topClients?: string[];
  error?: string;
}

export interface TlsStatus extends TlsTarget {
  ok: boolean;
  authorized: boolean;
  expiresAt?: string;
  daysRemaining?: number;
  issuer?: string;
  error?: string;
}

export interface MaintenanceWindow {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  sources: OperationsSource[];
}

interface OperationsState {
  releases: ReleaseStatus[];
  lastAdguard?: AdguardStatus;
  lastTls?: TlsStatus[];
  maintenance: MaintenanceWindow[];
  checkedAt?: string;
}

export interface OperationsSnapshot {
  config: PublicOperationsConfig;
  deployments: DeploymentRecord[];
  releases: ReleaseStatus[];
  adguard: AdguardStatus;
  tls: TlsStatus[];
  maintenance: MaintenanceWindow[];
  activeSuppressedSources: OperationsSource[];
  checkedAt: string | null;
  alertCount: number;
}

function defaultDataDir(): string {
  return process.env.NODE_ENV === "production"
    ? "/var/lib/mission-control"
    : resolve(/*turbopackIgnore: true*/ process.cwd(), ".mission-control");
}

export function defaultOperationsConfig(): OperationsConfig {
  return {
    githubRepos: [...DEFAULT_RELEASE_REPOS],
    adguardUrl: "",
    adguardUsername: "",
    adguardPassword: "",
    tlsTargets: [],
  };
}

function jsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRepo(value: string): string | null {
  const repo = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : null;
}

export function normalizeTlsTarget(value: Partial<TlsTarget>): TlsTarget | null {
  const name = stringValue(value.name);
  const host = stringValue(value.host);
  const port = Number(value.port ?? 443);
  if (!name || !host || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return { name, host, port };
}

export function normalizeOperationsConfig(
  input: Record<string, unknown>,
  current = defaultOperationsConfig(),
): OperationsConfig {
  const repos = Array.isArray(input.githubRepos)
    ? [...new Set(input.githubRepos.map((value) => normalizeRepo(String(value))).filter((value): value is string => Boolean(value)))]
    : current.githubRepos;
  const tlsTargets = Array.isArray(input.tlsTargets)
    ? input.tlsTargets.map((value) => normalizeTlsTarget(value as Partial<TlsTarget>)).filter((value): value is TlsTarget => Boolean(value))
    : current.tlsTargets;
  const password = stringValue(input.adguardPassword);

  return {
    githubRepos: repos,
    adguardUrl: Object.hasOwn(input, "adguardUrl")
      ? stringValue(input.adguardUrl).replace(/\/+$/, "")
      : current.adguardUrl,
    adguardUsername: Object.hasOwn(input, "adguardUsername")
      ? stringValue(input.adguardUsername)
      : current.adguardUsername,
    adguardPassword: password || current.adguardPassword,
    tlsTargets,
  };
}

function normalizeState(raw: Record<string, unknown>): OperationsState {
  return {
    releases: Array.isArray(raw.releases) ? raw.releases as ReleaseStatus[] : [],
    lastAdguard: raw.lastAdguard as AdguardStatus | undefined,
    lastTls: Array.isArray(raw.lastTls) ? raw.lastTls as TlsStatus[] : [],
    maintenance: Array.isArray(raw.maintenance) ? raw.maintenance as MaintenanceWindow[] : [],
    checkedAt: stringValue(raw.checkedAt) || undefined,
  };
}

async function readSetting(key: string): Promise<string | null> {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? null;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}

export async function getOperationsConfig(): Promise<OperationsConfig> {
  return normalizeOperationsConfig(jsonObject(await readSetting(OPERATIONS_CONFIG_KEY)));
}

export async function saveOperationsConfig(input: Record<string, unknown>): Promise<OperationsConfig> {
  const current = await getOperationsConfig();
  const next = normalizeOperationsConfig(input, current);
  await writeSetting(OPERATIONS_CONFIG_KEY, next);
  return next;
}

async function getOperationsState(): Promise<OperationsState> {
  return normalizeState(jsonObject(await readSetting(OPERATIONS_STATE_KEY)));
}

async function saveOperationsState(state: OperationsState): Promise<void> {
  await writeSetting(OPERATIONS_STATE_KEY, state);
}

export function publicConfig(config: OperationsConfig): PublicOperationsConfig {
  const { adguardPassword, ...safe } = config;
  return { ...safe, hasAdguardPassword: Boolean(adguardPassword) };
}


export async function fetchLatestReleases(config?: OperationsConfig): Promise<ReleaseStatus[]> {
  const resolvedConfig = config ?? await getOperationsConfig();
  const previous = (await getOperationsState()).releases;
  const acknowledged = new Map(previous.filter((item) => item.acknowledged).map((item) => [item.repo, item.tag]));
  return Promise.all(resolvedConfig.githubRepos.map(async (repo): Promise<ReleaseStatus> => {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Mission-Control" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const data = await response.json() as { tag_name?: string; html_url?: string; published_at?: string };
      const tag = data.tag_name ?? "unknown";
      return {
        repo,
        tag,
        url: data.html_url ?? `https://github.com/${repo}/releases`,
        publishedAt: data.published_at ?? "",
        acknowledged: acknowledged.get(repo) === tag,
      };
    } catch (error) {
      const old = previous.find((item) => item.repo === repo);
      return old
        ? { ...old, error: error instanceof Error ? error.message : "Release check failed" }
        : { repo, tag: "unknown", url: `https://github.com/${repo}/releases`, publishedAt: "", acknowledged: false, error: error instanceof Error ? error.message : "Release check failed" };
    }
  }));
}

export async function refreshReleases(): Promise<ReleaseStatus[]> {
  const releases = await fetchLatestReleases();
  const state = await getOperationsState();
  state.releases = releases;
  state.checkedAt = new Date().toISOString();
  await saveOperationsState(state);
  return releases;
}

function isPendingRelease(release: ReleaseStatus): boolean {
  return !release.acknowledged && !release.error && release.tag !== "unknown";
}

export async function acknowledgeRelease(repo: string, tag: string): Promise<void> {
  const state = await getOperationsState();
  state.releases = state.releases.map((item) => item.repo === repo && item.tag === tag ? { ...item, acknowledged: true } : item);
  await saveOperationsState(state);
}

export async function acknowledgeAllReleases(): Promise<void> {
  const state = await getOperationsState();
  state.releases = state.releases.map((item) => isPendingRelease(item) ? { ...item, acknowledged: true } : item);
  await saveOperationsState(state);
}

export function parseDeploymentLog(text: string): DeploymentRecord[] {
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const value = JSON.parse(line) as DeploymentRecord;
      if (!value.timestamp || !["started", "success", "failed"].includes(value.status)) return [];
      return [value];
    } catch {
      return [];
    }
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 20);
}

export async function getDeployments(): Promise<DeploymentRecord[]> {
  const path = process.env.DEPLOY_LOG_PATH || join(/*turbopackIgnore: true*/ defaultDataDir(), "deployments.jsonl");
  return parseDeploymentLog(await readFile(/*turbopackIgnore: true*/ path, "utf8").catch(() => ""));
}

function numberField(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function checkAdguard(config?: OperationsConfig): Promise<AdguardStatus> {
  const resolvedConfig = config ?? await getOperationsConfig();
  if (!resolvedConfig.adguardUrl) return { configured: false, ok: false };
  const headers: HeadersInit = {};
  if (resolvedConfig.adguardUsername || resolvedConfig.adguardPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${resolvedConfig.adguardUsername}:${resolvedConfig.adguardPassword}`).toString("base64")}`;
  }
  try {
    const request = async (path: string) => {
      const response = await fetch(`${resolvedConfig.adguardUrl}/control/${path}`, { headers, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`AdGuard returned ${response.status}`);
      return response.json() as Promise<Record<string, unknown>>;
    };
    const [status, stats] = await Promise.all([request("status"), request("stats")]);
    const queries = numberField(stats.num_dns_queries);
    const blocked = numberField(stats.num_blocked_filtering);
    const topClientsValue = stats.top_clients;
    const topClients = Array.isArray(topClientsValue)
      ? topClientsValue.flatMap((item) => item && typeof item === "object" ? Object.keys(item as Record<string, unknown>) : []).slice(0, 5)
      : [];
    return {
      configured: true,
      ok: true,
      protectionEnabled: status.protection_enabled === true,
      dnsQueries: queries,
      blockedFiltering: blocked,
      blockedPercent: queries && blocked !== undefined ? blocked / queries * 100 : 0,
      averageProcessingMs: numberField(stats.avg_processing_time) !== undefined ? numberField(stats.avg_processing_time)! * 1000 : undefined,
      topClients,
    };
  } catch (error) {
    return { configured: true, ok: false, error: error instanceof Error ? error.message : "AdGuard check failed" };
  }
}

export function tlsSeverity(status: TlsStatus): "ok" | "warning" | "error" {
  if (!status.ok || !status.authorized || status.daysRemaining === undefined || status.daysRemaining < 0) return "error";
  return status.daysRemaining <= 30 ? "warning" : "ok";
}

export async function checkTlsTarget(target: TlsTarget): Promise<TlsStatus> {
  return new Promise((done) => {
    const socket = connect({
      host: target.host,
      port: target.port,
      servername: isIP(target.host) ? undefined : target.host,
      rejectUnauthorized: false,
      timeout: 8_000,
    });
    let finished = false;
    const finish = (result: TlsStatus) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      done(result);
    };
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      if (!certificate?.valid_to) return finish({ ...target, ok: false, authorized: false, error: "Peer did not provide a certificate" });
      const expiresAt = new Date(certificate.valid_to);
      const issuer = certificate.issuer?.O || certificate.issuer?.CN;
      finish({
        ...target,
        ok: true,
        authorized: socket.authorized,
        expiresAt: expiresAt.toISOString(),
        daysRemaining: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000),
        issuer,
        error: socket.authorized ? undefined : String(socket.authorizationError ?? "Certificate validation failed"),
      });
    });
    socket.once("timeout", () => finish({ ...target, ok: false, authorized: false, error: "Connection timed out" }));
    socket.once("error", (error: Error) => finish({ ...target, ok: false, authorized: false, error: error.message }));
  });
}

export async function checkTls(config?: OperationsConfig): Promise<TlsStatus[]> {
  const resolvedConfig = config ?? await getOperationsConfig();
  return Promise.all(resolvedConfig.tlsTargets.map(checkTlsTarget));
}

export function activeMaintenance(windows: MaintenanceWindow[], now = Date.now()): MaintenanceWindow[] {
  return windows.filter((window) => Date.parse(window.startsAt) <= now && Date.parse(window.endsAt) > now);
}

export function sourceSuppressed(windows: MaintenanceWindow[], source: OperationsSource, now = Date.now()): boolean {
  return activeMaintenance(windows, now).some((window) => window.sources.includes(source));
}

export async function addMaintenanceWindow(input: Omit<MaintenanceWindow, "id">): Promise<MaintenanceWindow> {
  if (!input.reason.trim()) throw new Error("Maintenance reason is required");
  if (!Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.endsAt)) || Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new Error("Maintenance end must be after its start");
  }
  const window = { ...input, id: randomUUID(), reason: input.reason.trim(), sources: [...new Set(input.sources)] };
  const state = await getOperationsState();
  state.maintenance = [...state.maintenance.filter((item) => Date.parse(item.endsAt) > Date.now()), window];
  await saveOperationsState(state);
  return window;
}

export async function deleteMaintenanceWindow(id: string): Promise<void> {
  const state = await getOperationsState();
  state.maintenance = state.maintenance.filter((item) => item.id !== id);
  await saveOperationsState(state);
}

export function countOperationsAlerts(input: Pick<OperationsSnapshot, "deployments" | "releases" | "adguard" | "tls" | "maintenance">, now = Date.now()): number {
  let count = 0;
  if (!sourceSuppressed(input.maintenance, "deployments", now) && input.deployments[0]?.status === "failed") count += 1;
  if (!sourceSuppressed(input.maintenance, "releases", now)) count += input.releases.filter(isPendingRelease).length;
  if (!sourceSuppressed(input.maintenance, "adguard", now) && input.adguard.configured && (!input.adguard.ok || input.adguard.protectionEnabled === false)) count += 1;
  if (!sourceSuppressed(input.maintenance, "tls", now)) count += input.tls.filter((item) => tlsSeverity(item) !== "ok").length;
  return count;
}

export async function refreshOperationsChecks(): Promise<void> {
  const config = await getOperationsConfig();
  const [releases, adguard, tls] = await Promise.all([
    fetchLatestReleases(config),
    checkAdguard(config),
    checkTls(config),
  ]);
  const state = await getOperationsState();
  state.releases = releases;
  state.lastAdguard = adguard;
  state.lastTls = tls;
  state.checkedAt = new Date().toISOString();
  await saveOperationsState(state);
}


export async function getOperationsSnapshot(refresh = false): Promise<OperationsSnapshot> {
  if (refresh) await refreshOperationsChecks();
  const [config, state, deployments] = await Promise.all([
    getOperationsConfig(),
    getOperationsState(),
    getDeployments(),
  ]);
  const maintenance = state.maintenance.filter((item) => Date.parse(item.endsAt) > Date.now());
  const snapshot: OperationsSnapshot = {
    config: publicConfig(config),
    deployments,
    releases: state.releases,
    adguard: state.lastAdguard ?? { configured: Boolean(config.adguardUrl), ok: false },
    tls: state.lastTls ?? [],
    maintenance,
    activeSuppressedSources: [...new Set(activeMaintenance(maintenance).flatMap((item) => item.sources))],
    checkedAt: state.checkedAt ?? null,
    alertCount: 0,
  };
  snapshot.alertCount = countOperationsAlerts(snapshot);
  return snapshot;
}
