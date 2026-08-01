/** Shared types for the Proxmox UI components */

/** A raw Proxmox node (from GET /nodes) */
export interface PveNode {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
}

/** A QEMU VM or LXC container */
export interface PveGuest {
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
  type: "vm" | "lxc";
}

/** Storage pool */
export interface PveStoragePool {
  storage: string;
  type: string;
  total: number;
  used: number;
  avail: number;
}

/** Full details for a node including guests and storage (UI shape) */
export interface PveNodeDetail {
  node: PveNode;
  vms: PveGuest[];
  containers: PveGuest[];
  storage: PveStoragePool[];
}

/** Raw node snapshot as returned by GET /api/pve/status (matches server shape) */
export interface PveRawNodeSnapshot {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  vms: Omit<PveGuest, "type">[];
  containers: Omit<PveGuest, "type">[];
  storage: PveStoragePool[];
}

/** Snapshot of one Proxmox endpoint */
export interface PveEndpoint {
  id: number;
  name: string;
  apiUrl: string;
  online: boolean;
  error?: string;
  nodes: PveRawNodeSnapshot[];
}

/** Full cluster snapshot from the API */
export interface PveClusterStatus {
  endpoints: PveEndpoint[];
  fetchedAt: string;
}

/** Proxmox endpoint config (from DB, token masked) */
export interface PveEndpointConfig {
  id: number;
  name: string;
  apiUrl: string;
  apiToken: string;
  sshTargetMap: string;
  verifyTls: boolean;
  enabled: boolean;
  order: number;
}
