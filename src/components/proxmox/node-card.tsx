"use client";

import { useState } from "react";
import type { PveNodeDetail, PveGuest, PveStoragePool } from "./proxmox-types";

interface NodeCardProps {
  node: PveNodeDetail;
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
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 rounded-lg transition-colors">
      <span className="text-gray-400 text-xs font-mono w-12 shrink-0">{guest.vmid}</span>
      <span className="flex-1 text-sm font-medium truncate">{guest.name}</span>
      <StatusPill status={guest.status} />
      <div className="w-24 shrink-0 hidden sm:block">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 w-8 text-right">{(guest.cpu * 100).toFixed(0)}%</span>
          <div className="flex-1">
            <ProgressBar value={guest.cpu * guest.cpus * 100} max={guest.cpus * 100} color="bg-cyan-500" />
          </div>
        </div>
      </div>
      <div className="w-32 shrink-0 hidden md:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.mem} max={guest.maxmem} color="bg-purple-500" />
          <span className="text-xs text-gray-400 w-20 text-right">{humanBytes(guest.mem)}/{humanBytes(guest.maxmem)}</span>
        </div>
      </div>
      <div className="w-32 shrink-0 hidden lg:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.disk} max={guest.maxdisk} color="bg-emerald-500" />
          <span className="text-xs text-gray-400 w-20 text-right">{humanBytes(guest.disk)}/{humanBytes(guest.maxdisk)}</span>
        </div>
      </div>
      {guest.status === "running" && (
        <span className="text-xs text-gray-500 w-14 text-right shrink-0 hidden xl:block">{humanUptime(guest.uptime)}</span>
      )}
    </div>
  );
}

function StorageRow({ pool }: { pool: PveStoragePool }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">
      <span className="flex-1 text-sm font-medium truncate">{pool.storage}</span>
      <span className="text-xs text-gray-400 w-16 shrink-0">{pool.type}</span>
      <div className="w-48 shrink-0">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={pool.used} max={pool.total} color="bg-emerald-500" />
          <span className="text-xs text-gray-400 w-24 text-right">{humanBytes(pool.used)}/{humanBytes(pool.total)}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500 w-16 text-right shrink-0">{humanBytes(pool.avail)} free</span>
    </div>
  );
}

export function NodeCard({ node }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"vms" | "lxc" | "storage">("lxc");
  const n = node.node;

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
          <div className="px-3 pb-3">
            {/* Column headers */}
            {tab !== "storage" && (
              <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
                <span className="w-12 shrink-0">ID</span>
                <span className="flex-1">Name</span>
                <span className="w-16 shrink-0">Status</span>
                <span className="w-24 shrink-0 hidden sm:block">CPU</span>
                <span className="w-32 shrink-0 hidden md:block">Memory</span>
                <span className="w-32 shrink-0 hidden lg:block">Disk</span>
                <span className="w-14 shrink-0 hidden xl:block">Uptime</span>
              </div>
            )}

            {tab === "lxc" && (
              node.containers.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No LXC containers on this node</p>
                : node.containers.map((ct) => <GuestRow key={ct.vmid} guest={{ ...ct, type: "lxc" }} />)
            )}

            {tab === "vms" && (
              node.vms.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No VMs on this node</p>
                : node.vms.map((vm) => <GuestRow key={vm.vmid} guest={{ ...vm, type: "vm" }} />)
            )}

            {tab === "storage" && (
              node.storage.length === 0
                ? <p className="text-gray-500 text-sm py-4 text-center">No storage pools on this node</p>
                : <div className="px-4 py-1.5">
                    <div className="flex items-center gap-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
                      <span className="flex-1">Name</span>
                      <span className="w-16 shrink-0">Type</span>
                      <span className="w-48 shrink-0">Usage</span>
                      <span className="w-16 shrink-0 text-right">Free</span>
                    </div>
                    {node.storage.map((s) => <StorageRow key={s.storage} pool={s} />)}
                  </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
