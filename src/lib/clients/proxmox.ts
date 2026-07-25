/**
 * Proxmox VE API client
 *
 * Fetches cluster snapshots (nodes + guests + storage) from one or more
 * Proxmox endpoints. Auth uses API tokens (PVEAPIToken header).
 *
 * API ref: https://pve.proxmox.com/wiki/Proxmox_VE_API
 */

import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";

// ── Types ──────────────────────────────────────────────────────────────────

/** Raw node returned by GET /nodes */
export interface PveRawNode {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  type: "node";
  id: string;
  level?: string;
}

/** Raw QEMU VM returned by GET /nodes/{node}/qemu */
export interface PveRawQemu {
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

/** Raw LXC container returned by GET /nodes/{node}/lxc */
export interface PveRawLxc {
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

/** Raw storage returned by GET /nodes/{node}/storage */
export interface PveRawStorage {
  storage: string;
  type: string;
  total: number;
  used: number;
  avail: number;
  active: number;
  enabled: number;
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
  vms: PveRawQemu[];
  containers: PveRawLxc[];
  storage: PveRawStorage[];
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
// Uses Node's https module directly so we can control TLS verification on
// a per-request basis (Proxmox uses self-signed certs by default).

/** Per-request timeout — a hung Proxmox socket must not hang the status route. */
const REQUEST_TIMEOUT_MS = 10_000;

function httpsRequest(url: string, token: string, rejectUnauthorized: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      // Default to the standard Proxmox API port when none is given
      // (443/80 would be wrong for a bare host URL).
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

  /** Build full URL for a path like /nodes/{node}/qemu */
  private url(path: string): string {
    return `${this.baseUrl}/api2/json${path}`;
  }

  /** Generic request that unwraps Proxmox's { data: ... } envelope */
  private async _request<T>(path: string): Promise<T> {
    const body = await httpsRequest(this.url(path), this.apiToken, this.rejectUnauthorized);
    const json: unknown = JSON.parse(body);
    // Proxmox wraps data in { data: ... }
    const data = (json as { data: unknown }).data;
    return data as T;
  }

  /** List all nodes in the cluster */
  async getNodes(): Promise<PveRawNode[]> {
    return this._request<PveRawNode[]>("/nodes");
  }

  /** List QEMU VMs on a node */
  async getNodeQemu(node: string): Promise<PveRawQemu[]> {
    return this._request<PveRawQemu[]>(`/nodes/${encodeURIComponent(node)}/qemu`);
  }

  /** List LXC containers on a node */
  async getNodeLxc(node: string): Promise<PveRawLxc[]> {
    return this._request<PveRawLxc[]>(`/nodes/${encodeURIComponent(node)}/lxc`);
  }

  /** List storage pools on a node */
  async getNodeStorage(node: string): Promise<PveRawStorage[]> {
    return this._request<PveRawStorage[]>(`/nodes/${encodeURIComponent(node)}/storage`);
  }

  /** Fetch a full snapshot of all nodes + guests + storage for this endpoint */
  async getSnapshot(): Promise<PveEndpointSnapshot> {
    const nodes = await this.getNodes();

    const nodeSnapshots = await Promise.all(
      nodes.map(async (n) => {
        // Fetch guests and storage in parallel per node
        const [vms, containers, storage] = await Promise.all([
          n.status === "online"
            ? this.getNodeQemu(n.node).catch(() => [] as PveRawQemu[])
            : ([] as PveRawQemu[]),
          n.status === "online"
            ? this.getNodeLxc(n.node).catch(() => [] as PveRawLxc[])
            : ([] as PveRawLxc[]),
          n.status === "online"
            ? this.getNodeStorage(n.node).catch(() => [] as PveRawStorage[])
            : ([] as PveRawStorage[]),
        ]);

        return {
          node: n.node,
          status: n.status,
          cpu: n.cpu,
          maxcpu: n.maxcpu,
          mem: n.mem,
          maxmem: n.maxmem,
          disk: n.disk,
          maxdisk: n.maxdisk,
          uptime: n.uptime,
          vms,
          containers,
          storage,
        } satisfies PveNodeSnapshot;
      }),
    );

    return {
      id: 0, // filled by caller
      name: this.baseUrl,
      apiUrl: this.baseUrl,
      online: true,
      nodes: nodeSnapshots,
    };
  }
}
