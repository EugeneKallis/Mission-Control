/**
 * Pure, shared helpers for Proxmox utilization thresholds and alerts.
 * Safe to import from both server and client code.
 */

export interface PveThresholds {
  cpu: number;
  memory: number;
  storage: number;
}

export const DEFAULT_PVE_THRESHOLDS: PveThresholds = {
  cpu: 80,
  memory: 80,
  storage: 80,
};

export interface PveResourceAlert {
  metric: "cpu" | "memory" | "storage";
  value: number;
  max: number;
  pct: number;
}

export interface PveAlertSummary {
  /** Total resources (VMs + LXC containers + storage pools) currently exceeding any threshold. */
  count: number;
  /** Resource-level details for rendering, keyed by stable-ish identifier. */
  resources: Record<string, PveResourceAlert & { type: "vm" | "lxc" | "storage"; name: string; node: string; endpoint: string }>;
}

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0;
}

function breaches(value: number, max: number, threshold: number): boolean {
  return pct(value, max) > threshold;
}

export function buildThresholds(partial?: Partial<PveThresholds>): PveThresholds {
  return {
    cpu: clampThreshold(partial?.cpu),
    memory: clampThreshold(partial?.memory),
    storage: clampThreshold(partial?.storage),
  };
}

function clampThreshold(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PVE_THRESHOLDS.cpu;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function thresholdColorFor(pct: number, thresholds: PveThresholds, metric: "cpu" | "memory" | "storage"): {
  color: "error" | "warning" | "ok";
  className: string;
} {
  const threshold = thresholds[metric];
  if (pct > threshold) return { color: "error", className: "bg-error" };
  // ponytail: fixed warning band at 75% of the threshold ceiling keeps the
  // visual spectrum consistent regardless of user threshold. 75% below 80
  // threshold is a 60% warning line; reasonable tuning knob.
  if (pct > threshold * 0.75 && pct < threshold) return { color: "warning", className: "bg-warning" };
  return { color: "ok", className: "" };
}

export type PveGuestAlertInput = {
  vmid: number;
  name: string;
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  status: string;
  type?: "vm" | "lxc";
};

export function guestAlerts(guest: PveGuestAlertInput, thresholds: PveThresholds): PveResourceAlert[] {
  const alerts: PveResourceAlert[] = [];
  const cpuMax = guest.cpus * 100;
  if (breaches(guest.cpu * cpuMax, cpuMax, thresholds.cpu)) {
    alerts.push({ metric: "cpu", value: guest.cpu * cpuMax, max: cpuMax, pct: guest.cpu * 100 });
  }
  if (breaches(guest.mem, guest.maxmem, thresholds.memory)) {
    alerts.push({ metric: "memory", value: guest.mem, max: guest.maxmem, pct: pct(guest.mem, guest.maxmem) });
  }
  if (breaches(guest.disk, guest.maxdisk, thresholds.storage)) {
    alerts.push({ metric: "storage", value: guest.disk, max: guest.maxdisk, pct: pct(guest.disk, guest.maxdisk) });
  }
  return alerts;
}

export type PveStorageAlertInput = {
  storage: string;
  used: number;
  total: number;
  avail?: number;
};

export function storageAlerts(pool: PveStorageAlertInput, thresholds: PveThresholds): PveResourceAlert[] {
  if (breaches(pool.used, pool.total, thresholds.storage)) {
    return [{ metric: "storage", value: pool.used, max: pool.total, pct: pct(pool.used, pool.total) }];
  }
  return [];
}

export function isGuestBreaching(
  guest: PveGuestAlertInput,
  thresholds: PveThresholds,
): boolean {
  return guest.status === "running" && guestAlerts(guest, thresholds).length > 0;
}

export function isStorageBreaching(
  pool: PveStorageAlertInput,
  thresholds: PveThresholds,
): boolean {
  return storageAlerts(pool, thresholds).length > 0;
}

export function nodeHasBreach<
  G extends PveGuestAlertInput,
  S extends PveStorageAlertInput,
>(node: { vms: G[]; containers: G[]; storage: S[] }, thresholds: PveThresholds): boolean {
  return (
    node.vms.some((g) => isGuestBreaching(g, thresholds)) ||
    node.containers.some((g) => isGuestBreaching(g, thresholds)) ||
    node.storage.some((s) => isStorageBreaching(s, thresholds))
  );
}

export function filterNodeToBreaches<
  G extends PveGuestAlertInput,
  S extends PveStorageAlertInput,
>(node: { vms: G[]; containers: G[]; storage: S[] }, thresholds: PveThresholds): { vms: G[]; containers: G[]; storage: S[] } {
  return {
    vms: node.vms.filter((g) => isGuestBreaching(g, thresholds)),
    containers: node.containers.filter((g) => isGuestBreaching(g, thresholds)),
    storage: node.storage.filter((s) => isStorageBreaching(s, thresholds)),
  };
}

export function countPveAlerts(
  endpoints: {
    name: string;
    nodes: {
      node: string;
      vms: { vmid: number; name: string; cpu: number; cpus: number; mem: number; maxmem: number; disk: number; maxdisk: number; status: string; type?: "vm" }[];
      containers: { vmid: number; name: string; cpu: number; cpus: number; mem: number; maxmem: number; disk: number; maxdisk: number; status: string; type?: "lxc" }[];
      storage: { storage: string; used: number; total: number; avail: number }[];
    }[];
  }[],
  thresholds: PveThresholds | undefined,
): PveAlertSummary {
  const normalized = buildThresholds(thresholds);
  const resources: PveAlertSummary["resources"] = {};
  let count = 0;

  for (const ep of endpoints) {
    for (const node of ep.nodes) {
      for (const guest of node.vms) {
        if (guest.status !== "running") continue;
        const alerts = guestAlerts(guest, normalized);
        if (alerts.length > 0) {
          const key = `${ep.name}|${node.node}|vm|${guest.vmid}`;
          resources[key] = {
            type: "vm",
            name: guest.name,
            node: node.node,
            endpoint: ep.name,
            ...alerts[0], // surface the first breach metric for the badge tooltip
          };
          count += 1;
        }
      }
      for (const guest of node.containers) {
        if (guest.status !== "running") continue;
        const alerts = guestAlerts(guest, normalized);
        if (alerts.length > 0) {
          const key = `${ep.name}|${node.node}|lxc|${guest.vmid}`;
          resources[key] = {
            type: "lxc",
            name: guest.name,
            node: node.node,
            endpoint: ep.name,
            ...alerts[0],
          };
          count += 1;
        }
      }
      for (const pool of node.storage) {
        const alerts = storageAlerts(pool, normalized);
        if (alerts.length > 0) {
          const key = `${ep.name}|${node.node}|storage|${pool.storage}`;
          resources[key] = {
            type: "storage",
            name: pool.storage,
            node: node.node,
            endpoint: ep.name,
            ...alerts[0],
          };
          count += 1;
        }
      }
    }
  }

  return { count, resources };
}
