"use client";

import { useMemo, useState } from "react";
import type { PveNodeDetail, PveGuest, PveStoragePool } from "./proxmox-types";

interface NodeCardProps {
  node: PveNodeDetail;
  endpointName: string;
}

type SortDirection = "asc" | "desc";
type GuestSortKey = "vmid" | "name" | "status" | "cpu" | "memory" | "disk" | "uptime";
type StorageSortKey = "storage" | "type" | "usage" | "avail";

interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function ratio(value: number, max: number): number {
  return max > 0 ? value / max : 0;
}

function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return {
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortGuests(guests: PveGuest[], sort: SortState<GuestSortKey>): PveGuest[] {
  const valueFor = (guest: PveGuest): string | number => {
    switch (sort.key) {
      case "vmid": return guest.vmid;
      case "name": return guest.name;
      case "status": return guest.status;
      case "cpu": return guest.cpu;
      case "memory": return ratio(guest.mem, guest.maxmem);
      case "disk": return ratio(guest.disk, guest.maxdisk);
      case "uptime": return guest.uptime;
    }
  };

  const multiplier = sort.direction === "asc" ? 1 : -1;
  return [...guests].sort((a, b) => {
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    const compared = typeof aValue === "string" && typeof bValue === "string"
      ? textCollator.compare(aValue, bValue)
      : Number(aValue) - Number(bValue);
    return compared * multiplier;
  });
}

export function sortStorage(pools: PveStoragePool[], sort: SortState<StorageSortKey>): PveStoragePool[] {
  const valueFor = (pool: PveStoragePool): string | number => {
    switch (sort.key) {
      case "storage": return pool.storage;
      case "type": return pool.type;
      case "usage": return ratio(pool.used, pool.total);
      case "avail": return pool.avail;
    }
  };

  const multiplier = sort.direction === "asc" ? 1 : -1;
  return [...pools].sort((a, b) => {
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    const compared = typeof aValue === "string" && typeof bValue === "string"
      ? textCollator.compare(aValue, bValue)
      : Number(aValue) - Number(bValue);
    return compared * multiplier;
  });
}

function SortHeader<K extends string>({
  label,
  scope,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  scope: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className: string;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const nextDirection = active && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 hover:text-white transition-colors ${align === "right" ? "justify-end" : "justify-start"} ${active ? "text-gray-300" : ""}`}
        aria-label={`Sort by ${label} in ${scope}, ${active ? `currently ${sort.direction === "asc" ? "ascending" : "descending"}` : "not currently sorted"}. Activate to sort ${nextDirection}.`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-[9px]">
          {active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </div>
  );
}

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function humanUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-green-500/20 text-green-400",
    running: "bg-green-500/20 text-green-400",
    offline: "bg-red-500/20 text-red-400",
    stopped: "bg-red-500/20 text-red-400",
    unknown: "bg-yellow-500/20 text-yellow-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 75 ? "bg-yellow-500" : color;
  return (
    <div className="w-full bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function GuestRow({ guest }: { guest: PveGuest }) {
  return (
    <div role="row" className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 rounded-lg transition-colors">
      <span role="cell" className="text-gray-400 text-xs font-mono w-12 shrink-0">{guest.vmid}</span>
      <span role="cell" className="flex-1 text-sm font-medium truncate">{guest.name}</span>
      <span role="cell"><StatusPill status={guest.status} /></span>
      <div role="cell" className="w-24 shrink-0 hidden sm:block">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 w-8 text-right">{(guest.cpu * 100).toFixed(0)}%</span>
          <div className="flex-1">
            <ProgressBar value={guest.cpu * guest.cpus * 100} max={guest.cpus * 100} color="bg-cyan-500" />
          </div>
        </div>
      </div>
      <div role="cell" className="w-32 shrink-0 hidden md:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.mem} max={guest.maxmem} color="bg-purple-500" />
          <span className="text-xs text-gray-400 w-20 text-right">{humanBytes(guest.mem)}/{humanBytes(guest.maxmem)}</span>
        </div>
      </div>
      <div role="cell" className="w-32 shrink-0 hidden lg:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.disk} max={guest.maxdisk} color="bg-emerald-500" />
          <span className="text-xs text-gray-400 w-20 text-right">{humanBytes(guest.disk)}/{humanBytes(guest.maxdisk)}</span>
        </div>
      </div>
      <span role="cell" className="text-xs text-gray-500 w-14 text-right shrink-0 hidden xl:block">
        {guest.status === "running" ? humanUptime(guest.uptime) : "—"}
      </span>
    </div>
  );
}

function StorageRow({ pool }: { pool: PveStoragePool }) {
  return (
    <div role="row" className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">
      <span role="cell" className="flex-1 text-sm font-medium truncate">{pool.storage}</span>
      <span role="cell" className="text-xs text-gray-400 w-16 shrink-0">{pool.type}</span>
      <div role="cell" className="w-48 shrink-0">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={pool.used} max={pool.total} color="bg-emerald-500" />
          <span className="text-xs text-gray-400 w-24 text-right">{humanBytes(pool.used)}/{humanBytes(pool.total)}</span>
        </div>
      </div>
      <span role="cell" className="text-xs text-gray-500 w-16 text-right shrink-0">{humanBytes(pool.avail)} free</span>
    </div>
  );
}

export function NodeCard({ node, endpointName }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"vms" | "lxc" | "storage">("lxc");
  const [vmSort, setVmSort] = useState<SortState<GuestSortKey>>({ key: "vmid", direction: "asc" });
  const [lxcSort, setLxcSort] = useState<SortState<GuestSortKey>>({ key: "vmid", direction: "asc" });
  const [storageSort, setStorageSort] = useState<SortState<StorageSortKey>>({ key: "storage", direction: "asc" });
  const n = node.node;

  const sortedVms = useMemo(() => sortGuests(node.vms, vmSort), [node.vms, vmSort]);
  const sortedContainers = useMemo(() => sortGuests(node.containers, lxcSort), [node.containers, lxcSort]);
  const sortedStorage = useMemo(() => sortStorage(node.storage, storageSort), [node.storage, storageSort]);
  const guestSort = tab === "vms" ? vmSort : lxcSort;
  const tableScope = `${endpointName} ${n.node} ${tab === "lxc" ? "LXC containers" : tab === "vms" ? "VMs" : "storage"}`;
  const handleGuestSort = (key: GuestSortKey) => {
    if (tab === "vms") {
      setVmSort((current) => nextSort(current, key));
    } else {
      setLxcSort((current) => nextSort(current, key));
    }
  };

  const hasVms = node.vms.length > 0;
  const hasLxc = node.containers.length > 0;
  const hasStorage = node.storage.length > 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg font-semibold truncate">{n.node}</span>
          <StatusPill status={n.status} />
        </div>

        {/* CPU */}
        <div className="w-28 shrink-0 hidden sm:block">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">CPU</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.cpu * n.maxcpu * 100} max={n.maxcpu * 100} color="bg-blue-500" />
            <span className="text-xs text-gray-400 w-8 text-right">{(n.cpu * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* RAM */}
        <div className="w-36 shrink-0 hidden md:block">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">RAM</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.mem} max={n.maxmem} color="bg-purple-500" />
            <span className="text-xs text-gray-400 w-14 text-right">{humanBytes(n.mem)}</span>
          </div>
        </div>

        {/* Disk */}
        <div className="w-36 shrink-0 hidden lg:block">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Disk</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.disk} max={n.maxdisk} color="bg-emerald-500" />
            <span className="text-xs text-gray-400 w-14 text-right">{humanBytes(n.disk)}</span>
          </div>
        </div>

        {/* Uptime */}
        {n.status === "online" && (
          <div className="w-16 shrink-0 hidden xl:block">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Up</div>
            <div className="text-xs text-gray-400">{humanUptime(n.uptime)}</div>
          </div>
        )}

        {/* Expand indicator */}
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-700/50">
          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-3 pb-1">
            <button
              onClick={() => setTab("lxc")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === "lxc" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              LXC {hasLxc ? `(${node.containers.length})` : ""}
            </button>
            <button
              onClick={() => setTab("vms")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === "vms" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              VMs {hasVms ? `(${node.vms.length})` : ""}
            </button>
            <button
              onClick={() => setTab("storage")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === "storage" ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
            >
              Storage {hasStorage ? `(${node.storage.length})` : ""}
            </button>
          </div>

          {/* Content */}
          <div role="table" aria-label={tableScope} className="px-3 pb-3">
            {/* Column headers */}
            {tab !== "storage" && (
              <div role="row" className="flex items-center gap-3 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
                <SortHeader label="ID" scope={tableScope} sortKey="vmid" sort={guestSort} onSort={handleGuestSort} className="w-12 shrink-0" />
                <SortHeader label="Name" scope={tableScope} sortKey="name" sort={guestSort} onSort={handleGuestSort} className="flex-1" />
                <SortHeader label="Status" scope={tableScope} sortKey="status" sort={guestSort} onSort={handleGuestSort} className="w-16 shrink-0" />
                <SortHeader label="CPU" scope={tableScope} sortKey="cpu" sort={guestSort} onSort={handleGuestSort} className="w-24 shrink-0 hidden sm:flex" />
                <SortHeader label="Memory" scope={tableScope} sortKey="memory" sort={guestSort} onSort={handleGuestSort} className="w-32 shrink-0 hidden md:flex" />
                <SortHeader label="Disk" scope={tableScope} sortKey="disk" sort={guestSort} onSort={handleGuestSort} className="w-32 shrink-0 hidden lg:flex" />
                <SortHeader label="Uptime" scope={tableScope} sortKey="uptime" sort={guestSort} onSort={handleGuestSort} className="w-14 shrink-0 hidden xl:flex" />
              </div>
            )}

            {tab === "lxc" && (
              node.containers.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No LXC containers on this node</p>
                : sortedContainers.map((ct) => <GuestRow key={ct.vmid} guest={{ ...ct, type: "lxc" }} />)
            )}

            {tab === "vms" && (
              node.vms.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No VMs on this node</p>
                : sortedVms.map((vm) => <GuestRow key={vm.vmid} guest={{ ...vm, type: "vm" }} />)
            )}

            {tab === "storage" && (
              node.storage.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No storage pools on this node</p>
                : <div className="overflow-x-auto">
                    <div className="min-w-[36rem] px-4 py-1.5">
                      <div role="row" className="flex items-center gap-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
                        <SortHeader label="Name" scope={tableScope} sortKey="storage" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="flex-1" />
                        <SortHeader label="Type" scope={tableScope} sortKey="type" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-16 shrink-0" />
                        <SortHeader label="Usage" scope={tableScope} sortKey="usage" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-48 shrink-0" />
                        <SortHeader label="Free" scope={tableScope} sortKey="avail" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-16 shrink-0" align="right" />
                      </div>
                      {sortedStorage.map((s) => <StorageRow key={s.storage} pool={s} />)}
                    </div>
                  </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
