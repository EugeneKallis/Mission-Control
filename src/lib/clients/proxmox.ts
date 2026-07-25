/**
 * Proxmox VE API client
 *
 * Fetches cluster snapshots (nodes + guests + storage) from one or more
 * Proxmox endpoints via the /cluster/resources endpoint (one call gets
 * all resources with runtime stats). Auth uses API tokens (PVEAPIToken).
 *
 * API ref: https://pve.proxmox.com/wiki/Proxmox_VE_API
 */

import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A single resource from GET /cluster/resources.
 * Fields vary by type — the union models what's common + type-specific.
 */
export interface PveRawResource {
  type: "node" | "qemu" | "lxc" | "storage" | "sdn";
  id: string;
  node?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  vmid?: number;
  cpus?: number;
  name?: string;
  storage?: string;
  total?: number;
  used?: number;
  avail?: number;
  plugin_type?: string;
  content?: string;
  shared?: number;
  level?: string;
  template?: number;
}

/** Normalised QEMU VM (runtime stats included) */
export interface PveQemuGuest {
  vmid: number;
  name: string;
  status: "running" | "stopped";
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

/** Normalised LXC container (runtime stats included) */
export interface PveLxcGuest {
  vmid: number;
  name: string;
  status: "running" | "stopped";
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

/** Normalised storage pool */
export interface PveStorageInfo {
  storage: string;
  type: string;
  total: number;
  used: number;
  avail: number;
}

/** Snapshot of one node with its guests and storage */
export interface PveNodeSnapshot {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  vms: PveQemuGuest[];
  containers: PveLxcGuest[];
  storage: PveStorageInfo[];
}

/** Snapshot of one Proxmox API endpoint (one server/cluster) */
export interface PveEndpointSnapshot {
  id: number;
  name: string;
  apiUrl: string;
  online: boolean;
  error?: string;
  nodes: PveNodeSnapshot[];
}

/** Complete snapshot across all configured endpoints */
export interface PveClusterSnapshot {
  endpoints: PveEndpointSnapshot[];
  fetchedAt: string;
}

/** Proxmox endpoint config (as stored in DB) */
export interface ProxmoxEndpointConfig {
  id: number;
  name: string;
  apiUrl: string;
  apiToken: string;
  verifyTls: boolean;
  enabled: boolean;
  order: number;
}

// ── Low-level request helper ────────────────────────────────────────────────

/** Per-request timeout — a hung Proxmox socket must not hang the status route. */
const REQUEST_TIMEOUT_MS = 10_000;

function httpsRequest(url: string, token: string, rejectUnauthorized: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 8006,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        Authorization: `PVEAPIToken=${token}`,
        Accept: "application/json",
      },
      rejectUnauthorized,
    };

    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Proxmox returned ${res.statusCode} for ${parsed.pathname}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Proxmox request to ${parsed.hostname} timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

// ── Client ──────────────────────────────────────────────────────────────────

export class ProxmoxClient {
  private baseUrl: string;
  private apiToken: string;
  private rejectUnauthorized: boolean;

  constructor(baseUrl: string, apiToken: string, verifyTls = true) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiToken = apiToken;
    this.rejectUnauthorized = verifyTls;
  }

  /** Build full URL for a path */
  private url(path: string): string {
    return `${this.baseUrl}/api2/json${path}`;
  }

  /** Generic request that unwraps Proxmox's { data: ... } envelope */
  private async _request<T>(path: string): Promise<T> {
    const body = await httpsRequest(this.url(path), this.apiToken, this.rejectUnauthorized);
    const json: unknown = JSON.parse(body);
    return (json as { data: T }).data as T;
  }

  /**
   * Fetch a full snapshot of all nodes + guests + storage for this endpoint
   * using a single /cluster/resources call (returns everything with runtime
   * stats). Groups the flat resource list into per-node buckets.
   */
  async getSnapshot(): Promise<PveEndpointSnapshot> {
    const resources = await this._request<PveRawResource[]>("/cluster/resources");

    const nodeMap = new Map<string, PveNodeSnapshot>();

    for (const r of resources) {
      if (r.type === "node") {
        const nodeName = r.node ?? "unknown";
        nodeMap.set(nodeName, {
          node: nodeName,
          status: (r.status as "online" | "offline" | "unknown") ?? "unknown",
          cpu: r.cpu ?? 0,
          maxcpu: r.maxcpu ?? 0,
          mem: r.mem ?? 0,
          maxmem: r.maxmem ?? 0,
          disk: r.disk ?? 0,
          maxdisk: r.maxdisk ?? 0,
          uptime: r.uptime ?? 0,
          vms: [],
          containers: [],
          storage: [],
        });
      }

      if (r.type === "qemu" && r.vmid) {
        const nodeName = r.node ?? "unknown";
        if (!nodeMap.has(nodeName)) {
          // Synthetic node if /cluster/resources didn't include a node entry
          nodeMap.set(nodeName, {
            node: nodeName,
            status: "unknown",
            cpu: 0, maxcpu: 0, mem: 0, maxmem: 0, disk: 0, maxdisk: 0, uptime: 0,
            vms: [], containers: [], storage: [],
          });
        }
        nodeMap.get(nodeName)!.vms.push({
          vmid: r.vmid,
          name: r.name ?? `vm-${r.vmid}`,
          status: (r.status as "running" | "stopped") ?? "stopped",
          cpu: r.cpu ?? 0,
          cpus: r.maxcpu ?? 0, // /cluster/resources uses maxcpu for guest CPU count
          mem: r.mem ?? 0,
          maxmem: r.maxmem ?? 0,
          disk: r.disk ?? 0,
          maxdisk: r.maxdisk ?? 0,
          uptime: r.uptime ?? 0,
        });
      }

      if (r.type === "lxc" && r.vmid) {
        const nodeName = r.node ?? "unknown";
        if (!nodeMap.has(nodeName)) {
          nodeMap.set(nodeName, {
            node: nodeName, status: "unknown",
            cpu: 0, maxcpu: 0, mem: 0, maxmem: 0, disk: 0, maxdisk: 0, uptime: 0,
            vms: [], containers: [], storage: [],
          });
        }
        nodeMap.get(nodeName)!.containers.push({
          vmid: r.vmid,
          name: r.name ?? `ct-${r.vmid}`,
          status: (r.status as "running" | "stopped") ?? "stopped",
          cpu: r.cpu ?? 0,
          cpus: r.maxcpu ?? 0, // /cluster/resources uses maxcpu for guest CPU count
          mem: r.mem ?? 0,
          maxmem: r.maxmem ?? 0,
          disk: r.disk ?? 0,
          maxdisk: r.maxdisk ?? 0,
          uptime: r.uptime ?? 0,
        });
      }

      if (r.type === "storage" && r.storage) {
        const nodeName = r.node ?? "unknown";
        if (!nodeMap.has(nodeName)) {
          nodeMap.set(nodeName, {
            node: nodeName, status: "unknown",
            cpu: 0, maxcpu: 0, mem: 0, maxmem: 0, disk: 0, maxdisk: 0, uptime: 0,
            vms: [], containers: [], storage: [],
          });
        }
        nodeMap.get(nodeName)!.storage.push({
          storage: r.storage,
          type: r.plugin_type ?? r.type,
          total: r.total ?? 0,
          used: r.used ?? 0,
          avail: r.avail ?? 0,
        });
      }
    }

    return {
      id: 0, // filled by caller
      name: this.baseUrl,
      apiUrl: this.baseUrl,
      online: true,
      nodes: Array.from(nodeMap.values()),
    };
  }
}
