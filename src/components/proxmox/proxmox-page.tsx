"use client";

import { useCallback, useEffect, useState } from "react";
import { NodeCard } from "./node-card";
import { EndpointSettings } from "./endpoint-settings";
import type { PveClusterStatus, PveNodeDetail, PveEndpointConfig, PveRawNodeSnapshot } from "./proxmox-types";

/** Convert a raw API node snapshot to the UI detail shape */
function detailFromApi(node: PveRawNodeSnapshot): PveNodeDetail {
  return {
    node: {
      node: node.node,
      status: node.status,
      cpu: node.cpu,
      maxcpu: node.maxcpu,
      mem: node.mem,
      maxmem: node.maxmem,
      disk: node.disk,
      maxdisk: node.maxdisk,
      uptime: node.uptime,
    },
    vms: (node.vms || []).map((vm) => ({ ...vm, type: "vm" as const })),
    containers: (node.containers || []).map((ct) => ({ ...ct, type: "lxc" as const })),
    storage: (node.storage || []).map((s) => ({
      storage: s.storage,
      type: s.type,
      total: s.total ?? 0,
      used: s.used ?? 0,
      avail: s.avail ?? 0,
    })),
  };
}

export function ProxmoxPage() {
  const [status, setStatus] = useState<PveClusterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<PveEndpointConfig[]>([]);
  const [configOpen, setConfigOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pve/status");
      if (!res.ok) {
        if (res.status === 500) throw new Error("Server error");
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json: PveClusterStatus = await res.json();
      setStatus(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEndpoints = useCallback(async () => {
    try {
      const res = await fetch("/api/pve/endpoints");
      if (res.ok) {
        setEndpoints(await res.json());
      }
    } catch {
      // non-critical
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchStatus();
    fetchEndpoints();
  }, [fetchStatus, fetchEndpoints]);

  // Poll status every 30s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = useCallback(() => {
    fetchStatus();
    fetchEndpoints();
  }, [fetchStatus, fetchEndpoints]);

  // ── Render ──────────────────────────────────────────────────────────

  const totalVMs = status?.endpoints.reduce(
    (sum, ep) => sum + ep.nodes.reduce((s, n) => s + n.vms.length, 0), 0
  ) ?? 0;

  const totalLXC = status?.endpoints.reduce(
    (sum, ep) => sum + ep.nodes.reduce((s, n) => s + n.containers.length, 0), 0
  ) ?? 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Proxmox</h1>
          {loading && <span className="text-sm text-gray-400 animate-pulse">Loading…</span>}
          {status && (
            <span className="text-xs text-gray-500">
              {status.endpoints.length} endpoint{status.endpoints.length !== 1 ? "s" : ""} · {status.endpoints.reduce((s, e) => s + e.nodes.length, 0)} node{status.endpoints.reduce((s, e) => s + e.nodes.length, 0) !== 1 ? "s" : ""} · {totalVMs} VM{totalVMs !== 1 ? "s" : ""} · {totalLXC} LXC
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchStatus(); }}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className={`px-3 py-1.5 text-sm transition-colors flex items-center gap-1.5 rounded-lg ${configOpen ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {configOpen ? "Done" : "Manage Servers"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {configOpen && (
        <div className="px-6 py-4 border-b border-gray-700/50 bg-gray-800/30">
          <EndpointSettings endpoints={endpoints} onRefresh={handleRefresh} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Error state */}
        {error && !loading && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <p className="font-medium">Failed to fetch Proxmox status</p>
            <p className="text-sm mt-1">{error}</p>
            <button
              onClick={fetchStatus}
              className="mt-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Not configured */}
        {!loading && !error && status?.endpoints.length === 0 && !configOpen && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M12 5l14 7-14 7z" />
            </svg>
            <p className="text-lg font-medium mb-2">No Proxmox servers configured</p>
            <p className="text-sm mb-4">Click "Manage Servers" above to add your Proxmox API endpoint.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-gray-700/50 rounded w-32 mb-3" />
                <div className="h-3 bg-gray-700/50 rounded w-full mb-2" />
                <div className="h-3 bg-gray-700/50 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Endpoints */}
        {status?.endpoints.map((ep) => (
          <div key={ep.id}>
            {/* Endpoint header */}
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-semibold">{ep.name}</h2>
              {ep.online ? (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">Online</span>
              ) : (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium" title={ep.error}>
                  Offline
                </span>
              )}
              <span className="text-xs text-gray-500 font-mono">{ep.apiUrl.replace(/^https?:\/\//, "")}</span>
              {ep.error && <span className="text-xs text-red-400 truncate max-w-md" title={ep.error}>{ep.error}</span>}
            </div>

            {/* Node cards */}
            {ep.nodes.length === 0 && ep.online && (
              <p className="text-gray-500 text-sm py-4">No nodes found in this cluster.</p>
            )}
            <div className="space-y-3">
              {ep.nodes.map((node) => (
                <NodeCard key={node.node} node={detailFromApi(node)} />
              ))}
            </div>
          </div>
        ))}

        {/* Last fetched */}
        {status?.fetchedAt && (
          <p className="text-xs text-gray-600 text-center pt-2">
            Last updated: {new Date(status.fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            · Auto-refreshes every 30s
          </p>
        )}
      </div>
    </div>
  );
}
