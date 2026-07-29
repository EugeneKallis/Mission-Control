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

function EndpointStatusPill({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${
      online ? "bg-success/20 text-success" : "bg-error/20 text-error"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-success" : "bg-error"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

export function ProxmoxPage() {
  const [status, setStatus] = useState<PveClusterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<PveEndpointConfig[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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
      setLastUpdated(json.fetchedAt ? new Date(json.fetchedAt).toLocaleString() : null);
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

  const hasEndpoints = status && status.endpoints.length > 0;
  const totalVMs = hasEndpoints
    ? status.endpoints.reduce(
        (sum, ep) => sum + ep.nodes.reduce((s, n) => s + n.vms.length, 0), 0
      )
    : 0;
  const totalLXC = hasEndpoints
    ? status.endpoints.reduce(
        (sum, ep) => sum + ep.nodes.reduce((s, n) => s + n.containers.length, 0), 0
      )
    : 0;
  const totalEndpoints = hasEndpoints ? status.endpoints.length : endpoints.length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-4 border-b border-outline-variant/30 shrink-0">
        <div>
          <h1 className="text-xl font-bold font-display text-on-surface">Proxmox VE</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {hasEndpoints
              ? `${totalEndpoints} endpoint${totalEndpoints !== 1 ? "s" : ""} · ${totalVMs} VM${totalVMs !== 1 ? "s" : ""} · ${totalLXC} container${totalLXC !== 1 ? "s" : ""}`
              : "Virtual environment monitor"}
            {lastUpdated && <span className="ml-2 text-on-surface-variant/60">Last updated: {lastUpdated}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">settings</span>
            Manage Servers
          </button>
        </div>
      </div>

      {/* Surface refresh failures even when stale data remains on screen. */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-[var(--radius-card)] text-sm text-error bg-error/10 border border-error/30 flex items-center gap-2 shrink-0">
          <span className="material-symbols-outlined text-sm">warning</span>
          <span>{status ? `Refresh failed — showing last known status. ${error}` : error}</span>
        </div>
      )}

      {/* Per-endpoint errors — shown alongside data */}
      {hasEndpoints && status.endpoints.some((ep) => !ep.online) && (
        <div className="mx-6 mt-4 space-y-2 shrink-0">
          {status.endpoints.filter((ep) => !ep.online).map((ep) => (
            <div
              key={ep.id}
              className="px-4 py-3 rounded-[var(--radius-card)] text-sm text-error bg-error/10 border border-error/30 flex items-start gap-2"
            >
              <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">warning</span>
              <div>
                <span className="font-semibold">{ep.name}</span>
                {ep.error && <span>: {ep.error}</span>}
                <span className="ml-1 text-on-surface-variant/60">({ep.apiUrl})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-on-surface-variant text-sm">
            Loading cluster status...
          </div>
        ) : error && !status ? (
          <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-error/60">cloud_off</span>
            <p className="text-sm">Cluster status is temporarily unavailable.</p>
            <button
              onClick={fetchStatus}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Retry
            </button>
          </div>
        ) : !hasEndpoints ? (
          <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">dns</span>
            <p className="text-sm">
              {endpoints.length === 0
                ? "No Proxmox endpoints configured."
                : "No endpoints are enabled. Enable at least one endpoint in Manage Servers."}
            </p>
            <button
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {endpoints.length === 0 ? "Add Endpoint" : "Manage Servers"}
            </button>
          </div>
        ) : (
          status.endpoints.map((ep, ei) => {
            const endpointName = endpoints.find((e) => e.apiUrl === ep.apiUrl)?.name ?? ep.apiUrl;
            const nodeDetails = ep.nodes.map(detailFromApi);
            return (
              <div key={`ep-${ei}`} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-sm font-semibold text-on-surface font-display">{endpointName}</h2>
                  <EndpointStatusPill online={ep.online} />
                  <span className="text-[10px] text-on-surface-variant font-mono truncate max-w-[200px] sm:max-w-none">
                    {ep.apiUrl}
                  </span>
                </div>
                {ep.nodes.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-on-surface-variant bg-surface-container/30 rounded-[var(--radius-card)] border border-outline-variant/20">
                    <p>No nodes available on this endpoint.</p>
                  </div>
                ) : (
                  nodeDetails.map((nd, ni) => (
                    <NodeCard key={`node-${ni}`} node={nd} endpointName={endpointName} />
                  ))
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Settings modal */}
      {configOpen && (
        <EndpointSettings
          endpoints={endpoints}
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            fetchEndpoints();
            fetchStatus();
          }}
        />
      )}
    </div>
  );
}
