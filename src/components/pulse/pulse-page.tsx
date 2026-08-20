"use client";

import { useCallback, useEffect, useState } from "react";
import { PULSE_URL } from "@/lib/pulse";

interface PulseHealth {
  status?: string;
  uptime?: number;
  timestamp?: number;
  dependencies?: Record<string, boolean>;
}

interface PulseVersion {
  version?: string;
  build?: string;
  deploymentType?: string;
  containerized?: boolean;
}

interface PulseSecurity {
  hasAuthentication?: boolean;
  requiresAuth?: boolean;
  ssoEnabled?: boolean;
}

export type PulseResource = Record<string, unknown>;

export interface PulseSnapshot {
  fetchedAt: string;
  health: PulseHealth | null;
  version: PulseVersion | null;
  security: PulseSecurity | null;
  resources: PulseResource[];
  resourceCount: number | null;
  authenticated: boolean;
  resourcesError: string | null;
  errors: string[];
}

function formatUptime(seconds: number | undefined): string {
  if (!Number.isFinite(seconds) || seconds == null) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function resourceValue(resource: PulseResource, ...keys: string[]): string {
  for (const key of keys) {
    const value = resource[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "—";
}

function valueAtPath(resource: PulseResource, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, resource);
}

function numberValue(resource: PulseResource, ...keys: string[]): number | undefined {
  const paths = keys.flatMap((key) => key.includes(".") ? [key] : [key, `metrics.${key}`, `stats.${key}`]);
  for (const path of paths) {
    const value = valueAtPath(resource, path);
    const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function resourceType(resource: PulseResource): string {
  return resourceValue(resource, "type", "kind", "resourceType", "category");
}

type ResourceDisplayGroup = "Host" | "LXCs" | "VMs" | "Docker containers" | string;

const PRIORITY_RESOURCE_GROUPS = ["Host", "LXCs", "VMs", "Docker containers"] as const;
const IGNORED_RESOURCE_TYPES = new Set(["docker image", "docker network", "docker volume"]);

function normalizedResourceType(resource: PulseResource): string {
  return resourceType(resource).toLowerCase().replace(/[_-]/g, " ").trim();
}

function isIgnoredResource(resource: PulseResource): boolean {
  return IGNORED_RESOURCE_TYPES.has(normalizedResourceType(resource));
}

function resourceTypeLabel(resource: PulseResource): string {
  const type = normalizedResourceType(resource);
  if (["qemu", "vm", "virtual machine"].includes(type)) return "VM";
  if (["lxc", "system container"].includes(type)) return "LXC";
  if (["container", "oci container", "app container", "docker container", "docker service", "docker task"].includes(type)) return "Docker container";
  if (["agent", "host", "docker host"].includes(type)) return "Host";
  if (["storage", "physical disk", "ceph", "pbs", "pmg"].includes(type)) return "Storage";
  return resourceType(resource) === "—" ? "Other" : resourceType(resource);
}

function resourceDisplayGroup(resource: PulseResource): ResourceDisplayGroup {
  const type = normalizedResourceType(resource);
  if (["agent", "host", "docker host"].includes(type)) return "Host";
  if (["lxc", "system container"].includes(type)) return "LXCs";
  if (["qemu", "vm", "virtual machine"].includes(type)) return "VMs";
  if (["container", "oci container", "app container", "docker container", "docker service", "docker task"].includes(type)) return "Docker containers";
  return resourceTypeLabel(resource);
}

function resourceName(resource: PulseResource, index: number): string {
  const name = resourceValue(resource, "name", "displayName", "hostname", "host");
  if (name !== "—") return name;
  const id = resourceValue(resource, "vmid", "id", "resourceId");
  return id === "—" ? `Resource ${index + 1}` : id;
}

function resourceId(resource: PulseResource): string {
  return resourceValue(resource, "vmid", "id", "resourceId");
}

function resourceGroup(resource: PulseResource): "Proxmox" | "Docker" | "Other" {
  const source = resourceValue(resource, "source", "platform", "provider").toLowerCase();
  const type = resourceType(resource).toLowerCase();
  const dockerTypes = ["docker-host", "app-container", "docker-service", "docker-image", "docker-volume", "docker-network", "docker-task", "docker-swarm-node", "docker-secret", "docker-config"];
  const proxmoxTypes = ["agent", "vm", "qemu", "lxc", "system-container", "oci-container", "storage", "physical_disk", "ceph", "pbs", "pmg"];
  if (source === "docker" || dockerTypes.includes(type)) return "Docker";
  if (["proxmox", "pve"].includes(source) || proxmoxTypes.includes(type)) return "Proxmox";
  return "Other";
}

type ResourceMetricKind = "cpu" | "memory" | "disk";
type ResourceSortColumn = "name" | "type" | "id" | "status" | "cpu" | "memory" | "disk" | "uptime" | "network" | "diskIo" | "location";
type SortDirection = "asc" | "desc";

interface ResourceMetricValues {
  used?: number;
  max?: number;
  percent?: number;
}

interface ResourceMetricKeys {
  explicit: string[];
  used: string[];
  max: string[];
}

const RESOURCE_METRIC_KEYS: Record<ResourceMetricKind, ResourceMetricKeys> = {
  cpu: {
    explicit: ["cpuPercent", "cpu_percent", "cpuUsagePercent", "cpu_usage_percent", "metrics.cpu.percent"],
    used: [],
    max: [],
  },
  memory: {
    explicit: ["memoryPercent", "memory_percent", "memoryUsagePercent", "memory_usage_percent", "metrics.memory.percent"],
    used: ["mem", "memoryUsed", "memory_used", "usedMemory", "memory", "metrics.memory.used", "metrics.memory.current", "metrics.mem.used"],
    max: ["maxmem", "maxMemory", "memoryTotal", "memory_total", "totalMemory", "metrics.memory.max", "metrics.memory.total", "metrics.mem.max"],
  },
  disk: {
    explicit: ["diskPercent", "disk_percent", "diskUsagePercent", "disk_usage_percent", "disk.current", "metrics.disk.percent"],
    used: ["disk", "disk.used", "diskUsed", "disk_used", "usedDisk", "metrics.disk.used", "metrics.disk.current"],
    max: ["maxdisk", "maxDisk", "disk.total", "diskTotal", "disk_total", "totalDisk", "metrics.disk.max", "metrics.disk.total"],
  },
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

function resourceMetricValues(resource: PulseResource, kind: ResourceMetricKind): ResourceMetricValues {
  const keys = RESOURCE_METRIC_KEYS[kind];
  const explicit = numberValue(resource, ...keys.explicit);
  if (explicit !== undefined) return explicit < 0 ? {} : { percent: clampPercent(explicit) };

  if (kind === "cpu") {
    // Proxmox's raw cpu value is a fraction of one core and may exceed 1 for
    // multi-core guests. Percent-named fields above are already percentages.
    const cpu = numberValue(resource, "cpu");
    if (cpu !== undefined) return { percent: clampPercent(cpu * 100) };
    const usage = numberValue(resource, "cpuUsage", "cpu_usage");
    return usage === undefined ? {} : { percent: clampPercent(usage <= 1 ? usage * 100 : usage) };
  }

  const used = numberValue(resource, ...keys.used);
  const max = numberValue(resource, ...keys.max);
  return {
    used,
    max,
    percent: used !== undefined && max !== undefined && max > 0 ? clampPercent((used / max) * 100) : undefined,
  };
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function resourceMetricDetail(values: ResourceMetricValues, kind: ResourceMetricKind): string {
  if (kind === "cpu") return values.percent === undefined ? "—" : `${values.percent.toFixed(0)}%`;
  if (values.used === undefined) return "—";
  return values.max === undefined
    ? `${formatBytes(values.used)}${values.percent === undefined ? "" : ` · ${values.percent.toFixed(0)}%`}`
    : `${formatBytes(values.used)} / ${formatBytes(values.max)}`;
}

function formatResourceUptime(resource: PulseResource): string {
  const uptime = numberValue(resource, "uptime", "uptimeSeconds", "uptime_seconds");
  return uptime === undefined ? "—" : formatUptime(uptime);
}

function resourceSortValue(resource: PulseResource, column: ResourceSortColumn): string | number | undefined {
  switch (column) {
    case "name": return resourceName(resource, 0);
    case "type": return resourceTypeLabel(resource);
    case "id": return resourceId(resource);
    case "status": return resourceValue(resource, "status", "state", "health");
    case "cpu": return resourceMetricValues(resource, "cpu").percent;
    case "memory": return resourceMetricValues(resource, "memory").percent;
    case "disk": return resourceMetricValues(resource, "disk").percent;
    case "uptime": return numberValue(resource, "uptime", "uptimeSeconds", "uptime_seconds");
    case "network": return (numberValue(resource, "netin", "netIn", "networkIn", "network_in", "rxBytes", "rx_bytes") ?? 0)
      + (numberValue(resource, "netout", "netOut", "networkOut", "network_out", "txBytes", "tx_bytes") ?? 0);
    case "diskIo": return (numberValue(resource, "diskread", "diskRead", "disk_read", "readBytes", "read_bytes") ?? 0)
      + (numberValue(resource, "diskwrite", "diskWrite", "disk_write", "writeBytes", "write_bytes") ?? 0);
    case "location": return resourceValue(resource, "node", "hostname", "host", "server");
  }
}

function formatIo(resource: PulseResource, direction: "network" | "disk"): string {
  const keys = direction === "network"
    ? [["netin", "netIn", "networkIn", "network_in", "rxBytes", "rx_bytes", "metrics.network.in", "metrics.network.rx", "metrics.network.received"], ["netout", "netOut", "networkOut", "network_out", "txBytes", "tx_bytes", "metrics.network.out", "metrics.network.tx", "metrics.network.sent"]]
    : [["diskread", "diskRead", "disk_read", "readBytes", "read_bytes", "metrics.disk.read", "metrics.disk.readBytes"], ["diskwrite", "diskWrite", "disk_write", "writeBytes", "write_bytes", "metrics.disk.write", "metrics.disk.writeBytes"]];
  const incoming = numberValue(resource, ...keys[0]);
  const outgoing = numberValue(resource, ...keys[1]);
  if (incoming === undefined && outgoing === undefined) return "—";
  return `${direction === "network" ? "↓" : "R"} ${formatBytes(incoming)} ${direction === "network" ? "↑" : "W"} ${formatBytes(outgoing)}`;
}

function metricColors(percent: number, baseColor: string): { bar: string; text: string } {
  if (percent > 90) return { bar: "bg-error", text: "text-error" };
  if (percent > 75) return { bar: "bg-warning", text: "text-warning" };
  return { bar: baseColor, text: "text-on-surface-variant" };
}

function ResourceMetric({ resource, kind }: { resource: PulseResource; kind: ResourceMetricKind }) {
  const values = resourceMetricValues(resource, kind);
  const percent = values.percent;
  const baseColor = kind === "cpu" ? "bg-primary" : kind === "memory" ? "bg-secondary" : "bg-success";
  if (percent === undefined) return <span className="text-on-surface-variant">—</span>;
  const colors = metricColors(percent, baseColor);
  return (
    <div className="min-w-[140px]">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={`${kind} utilization`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-outline-variant/30"
        >
          <div className={`h-full rounded-full transition-all duration-500 ${colors.bar}`} style={{ width: `${percent}%` }} />
        </div>
        <span className={`w-10 text-right text-[11px] font-semibold ${colors.text}`}>{percent.toFixed(0)}%</span>
      </div>
      <span className="mt-1 block text-[10px] text-on-surface-variant">{resourceMetricDetail(values, kind)}</span>
    </div>
  );
}

function resourceSearchText(resource: PulseResource): string {
  const fields = [
    "name", "displayName", "id", "resourceId", "vmid", "type", "kind", "resourceType", "category",
    "status", "state", "health", "node", "hostname", "host", "server", "platform", "source", "provider",
  ];
  return fields.map((field) => resource[field]).filter((value) => typeof value === "string" || typeof value === "number").join(" ").toLowerCase();
}

function StatusPill({ healthy }: { healthy: boolean }) {
  const state = healthy ? "success" : "failed";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: `var(--status-${state}-bg)`,
        color: `var(--status-${state}-fg)`,
        border: `1px solid var(--status-${state}-border)`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(--status-${state}-fg)` }}
      />
      {healthy ? "Operational" : "Degraded"}
    </span>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">{label}</p>
      <p className="mt-2 text-lg font-semibold text-on-surface">{value}</p>
      {detail && <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>}
    </div>
  );
}

function ResourceSortHeader({
  label,
  column,
  type,
  sort,
  onSort,
}: {
  label: string;
  column: ResourceSortColumn;
  type: string;
  sort: { column: ResourceSortColumn; direction: SortDirection };
  onSort: (type: string, column: ResourceSortColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => onSort(type, column)}
        aria-label={`Sort ${label} ${active && sort.direction === "asc" ? "descending" : "ascending"}`}
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-on-surface"
      >
        {label}
        <span aria-hidden="true" className="material-symbols-outlined text-xs">
          {active ? (sort.direction === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
        </span>
      </button>
    </th>
  );
}

export function PulsePage() {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceGroupFilter, setResourceGroupFilter] = useState("All");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupSorts, setGroupSorts] = useState<Record<string, { column: ResourceSortColumn; direction: SortDirection }>>({});

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/pulse/status", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<PulseSnapshot> & { error?: string };
      if (!response.ok) {
        const endpointErrors = Array.isArray(body.errors) ? body.errors.join("; ") : undefined;
        throw new Error(body.error || endpointErrors || "Pulse public API is unavailable");
      }
      setSnapshot({
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        health: body.health ?? null,
        version: body.version ?? null,
        security: body.security ?? null,
        resources: Array.isArray(body.resources) ? body.resources as PulseResource[] : [],
        resourceCount: body.resourceCount ?? null,
        authenticated: body.authenticated ?? false,
        resourcesError: body.resourcesError ?? null,
        errors: body.errors ?? [],
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pulse public API is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Polling is the external synchronization boundary for this dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const healthStatus = snapshot?.health?.status?.toLowerCase();
  const healthy = healthStatus === "healthy";
  const dependencies = snapshot?.health?.dependencies ?? {};
  const hasPartialErrors = Boolean(snapshot?.errors.length);
  const visibleResources = (snapshot?.resources ?? []).filter((resource) => !isIgnoredResource(resource));
  const visibleResourceCount = visibleResources.length;
  const resourceDetail = !snapshot?.authenticated
    ? "API key not configured"
    : snapshot.resourceCount != null
      ? "Authenticated API"
      : snapshot.resourcesError
        ? `Key rejected or resources unavailable — ${snapshot.resourcesError}`
        : "Key rejected or resources unavailable — check Config → Pulse API Key";
  const filteredResources = visibleResources.filter((resource) => {
    const matchesGroup = resourceGroupFilter === "All" || resourceGroup(resource) === resourceGroupFilter;
    const query = resourceQuery.trim().toLowerCase();
    const matchesQuery = !query || resourceSearchText(resource).includes(query);
    return matchesGroup && matchesQuery;
  });
  const resourceGroups = Array.from(
    filteredResources.reduce((groups, resource) => {
      const type = resourceDisplayGroup(resource);
      const group = groups.get(type) ?? [];
      group.push(resource);
      groups.set(type, group);
      return groups;
    }, new Map<string, PulseResource[]>()).entries(),
  ).map(([type, resources]) => [
    type,
    [...resources].sort((a, b) => {
      const byName = resourceName(a, 0).localeCompare(resourceName(b, 0), undefined, { numeric: true, sensitivity: "base" });
      return byName || resourceId(a).localeCompare(resourceId(b), undefined, { numeric: true, sensitivity: "base" });
    }),
  ] as [string, PulseResource[]]).sort(([a], [b]) => {
    const aPriority = PRIORITY_RESOURCE_GROUPS.indexOf(a as typeof PRIORITY_RESOURCE_GROUPS[number]);
    const bPriority = PRIORITY_RESOURCE_GROUPS.indexOf(b as typeof PRIORITY_RESOURCE_GROUPS[number]);
    if (aPriority !== -1 || bPriority !== -1) {
      return (aPriority === -1 ? PRIORITY_RESOURCE_GROUPS.length : aPriority)
        - (bPriority === -1 ? PRIORITY_RESOURCE_GROUPS.length : bPriority);
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const isGroupExpanded = (type: string): boolean => {
    if (resourceQuery.trim()) return true;
    const priority = PRIORITY_RESOURCE_GROUPS.includes(type as typeof PRIORITY_RESOURCE_GROUPS[number]);
    return collapsedGroups[type] ?? priority;
  };

  const sortGroupResources = (type: string, resources: PulseResource[]): PulseResource[] => {
    const sort = groupSorts[type] ?? { column: "name" as ResourceSortColumn, direction: "asc" as SortDirection };
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...resources].sort((a, b) => {
      const left = resourceSortValue(a, sort.column);
      const right = resourceSortValue(b, sort.column);
      if (left === undefined && right === undefined) return 0;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
      return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  };

  const toggleGroupSort = (type: string, column: ResourceSortColumn) => {
    setGroupSorts((current) => {
      const previous = current[type] ?? { column: "name" as ResourceSortColumn, direction: "asc" as SortDirection };
      return {
        ...current,
        [type]: {
          column,
          direction: previous.column === column && previous.direction === "asc" ? "desc" : "asc",
        },
      };
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Pulse">
      <header className="flex shrink-0 flex-col gap-3 border-b border-outline-variant/30 bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">monitor_heart</span>
            <h1 className="text-xl font-bold font-display text-on-surface">Pulse Monitor</h1>
            {!loading && snapshot?.health && <StatusPill healthy={healthy} />}
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            Native overview from Pulse&apos;s public health API
            {snapshot?.fetchedAt && <span className="ml-2 text-on-surface-variant/60">Updated {new Date(snapshot.fetchedAt).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-base ${refreshing ? "animate-spin" : ""}`}>refresh</span>
            Refresh
          </button>
          <a
            href={PULSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">open_in_new</span>
            Full Pulse
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && (
          <div className="flex min-h-48 items-center justify-center rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface" role="status">
            <span className="text-sm text-on-surface-variant">Loading Pulse status…</span>
          </div>
        )}

        {!loading && error && !snapshot && (
          <div className="rounded-[var(--radius-card)] border border-error/30 bg-error/10 p-5" role="alert">
            <h2 className="text-base font-semibold text-error">Pulse status unavailable</h2>
            <p className="mt-2 text-sm text-on-surface-variant">{error}</p>
            <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
              Open Pulse directly
            </a>
          </div>
        )}

        {!loading && snapshot && (
          <div className="space-y-5">
            {hasPartialErrors && (
              <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-on-surface" role="status">
                <p>Some public Pulse details could not be loaded. Authenticated dashboards remain available through <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Full Pulse</a>.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                  {snapshot.errors.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Status" value={snapshot.health?.status ?? "Unknown"} detail="Pulse health endpoint" />
              <MetricCard label="Uptime" value={formatUptime(snapshot.health?.uptime)} detail="Since Pulse started" />
              <MetricCard label="Version" value={snapshot.version?.version ?? "Unknown"} detail={snapshot.version?.build ?? "Build unavailable"} />
              <MetricCard label="Resources" value={snapshot.resourceCount == null ? "—" : String(visibleResourceCount)} detail={resourceDetail} />
              <MetricCard label="Authentication" value={snapshot.security?.requiresAuth ? "Required" : "Not required"} detail={snapshot.security?.ssoEnabled ? "SSO enabled" : "Local login"} />
            </div>

            {snapshot.authenticated && (snapshot.resources.length > 0 || snapshot.resourceCount !== null) && (
              <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-on-surface">Monitored resources</h2>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {filteredResources.length} of {visibleResourceCount} visible resources shown.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="pulse-resource-search">Search resources</label>
                    <input
                      id="pulse-resource-search"
                      value={resourceQuery}
                      onChange={(event) => setResourceQuery(event.target.value)}
                      placeholder="Search resources…"
                      className="rounded-[var(--radius-button)] border border-outline-variant/40 bg-surface-container px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
                    />
                    <label className="sr-only" htmlFor="pulse-resource-group">Filter resources</label>
                    <select
                      id="pulse-resource-group"
                      value={resourceGroupFilter}
                      onChange={(event) => setResourceGroupFilter(event.target.value)}
                      className="rounded-[var(--radius-button)] border border-outline-variant/40 bg-surface-container px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
                    >
                      <option>All</option>
                      <option>Proxmox</option>
                      <option>Docker</option>
                      <option>Other</option>
                    </select>
                    <span className="whitespace-nowrap text-xs text-on-surface-variant">
                      Groups are collapsible
                    </span>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  {filteredResources.length > 0 && resourceGroups.map(([type, resources]) => {
                    const expanded = isGroupExpanded(type);
                    const sort = groupSorts[type] ?? { column: "name" as ResourceSortColumn, direction: "asc" as SortDirection };
                    const sortedResources = sortGroupResources(type, resources);
                    return (
                      <table key={type} className="mb-4 w-full min-w-[1320px] text-left text-xs last:mb-0">
                        <thead className="border-b border-outline-variant/30 text-[10px] uppercase tracking-wider text-on-surface-variant/70">
                          <tr className="bg-surface-container/60">
                            <th colSpan={12} className="px-3 py-2 text-left text-primary">
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? "Collapse" : "Expand"} ${type} group`}
                                onClick={() => setCollapsedGroups((groups) => ({ ...groups, [type]: expanded ? false : true }))}
                                className="inline-flex items-center gap-1.5 text-left hover:text-on-surface"
                              >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">{expanded ? "expand_less" : "expand_more"}</span>
                                {type} <span className="text-on-surface-variant">({resources.length})</span>
                              </button>
                            </th>
                          </tr>
                          <tr>
                            <ResourceSortHeader label="Name" column="name" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Type" column="type" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="ID" column="id" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Status" column="status" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="CPU" column="cpu" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Memory" column="memory" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Disk" column="disk" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Uptime" column="uptime" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Net IO (total)" column="network" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Disk IO (total)" column="diskIo" type={type} sort={sort} onSort={toggleGroupSort} />
                            <ResourceSortHeader label="Location" column="location" type={type} sort={sort} onSort={toggleGroupSort} />
                            <th className="px-3 py-2 font-semibold">Details</th>
                          </tr>
                        </thead>
                        {expanded && (
                          <tbody className="divide-y divide-outline-variant/20">
                            {sortedResources.map((resource, index) => {
                              const status = resourceValue(resource, "status", "state", "health");
                              const statusLower = status.toLowerCase();
                              const statusClass = /online|running|healthy|ready|active/.test(statusLower)
                                ? "bg-success/15 text-success"
                                : /offline|stopped|error|failed|unhealthy/.test(statusLower)
                                  ? "bg-error/15 text-error"
                                  : "bg-surface-container-high/50 text-on-surface-variant";
                              return (
                                <tr key={`${resourceId(resource)}-${resourceName(resource, index)}-${index}`} className="hover:bg-surface-container/50">
                                  <td className="max-w-[200px] truncate px-3 py-3 font-medium text-on-surface">{resourceName(resource, index)}</td>
                                  <td className="px-3 py-3 font-semibold text-primary">{resourceTypeLabel(resource)}</td>
                                  <td className="px-3 py-3 font-mono text-on-surface-variant">{resourceId(resource)}</td>
                                  <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>{status}</span></td>
                                  <td className="px-3 py-3"><ResourceMetric resource={resource} kind="cpu" /></td>
                                  <td className="px-3 py-3"><ResourceMetric resource={resource} kind="memory" /></td>
                                  <td className="px-3 py-3"><ResourceMetric resource={resource} kind="disk" /></td>
                                  <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant">{formatResourceUptime(resource)}</td>
                                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] text-on-surface-variant">{formatIo(resource, "network")}</td>
                                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] text-on-surface-variant">{formatIo(resource, "disk")}</td>
                                  <td className="px-3 py-3 text-on-surface-variant">{resourceValue(resource, "node", "hostname", "host", "server")}</td>
                                  <td className="px-3 py-3"><details><summary className="cursor-pointer text-primary hover:underline">View details</summary><pre className="mt-2 max-w-[420px] overflow-auto whitespace-pre-wrap rounded bg-surface-container p-2 text-[10px] text-on-surface-variant">{JSON.stringify(resource, null, 2)}</pre></details></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        )}
                      </table>
                    );
                  })}
                  {filteredResources.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-on-surface-variant">
                      {resourceQuery.trim() || resourceGroupFilter !== "All"
                        ? "No resources match the current filter."
                        : "Pulse reported no monitored resources."}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">Pulse dependencies</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">Public readiness signals reported by Pulse.</p>
                </div>
                <span className="text-xs text-on-surface-variant">{Object.values(dependencies).filter(Boolean).length}/{Object.keys(dependencies).length} ready</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {Object.entries(dependencies).map(([name, ready]) => (
                  <div key={name} className="flex items-center justify-between rounded-[var(--radius-button)] bg-surface-container px-3 py-2.5">
                    <span className="text-sm capitalize text-on-surface">{name}</span>
                    <span className={`text-xs font-semibold ${ready ? "text-success" : "text-error"}`}>{ready ? "Ready" : "Unavailable"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-5">
              <h2 className="text-sm font-semibold text-on-surface">Detailed monitoring</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                Pulse protects its detailed infrastructure API behind its own authentication. When a Pulse API key is configured, this overview also reports the resource count from Pulse&apos;s authenticated resources API. Use Full Pulse for hosts, containers, alerts, logs, charts, and live WebSocket monitoring.
              </p>
              <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
                Open authenticated Pulse dashboard
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
