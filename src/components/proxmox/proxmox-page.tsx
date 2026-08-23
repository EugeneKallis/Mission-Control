"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NodeCard, matchNodeQuery, type GuestRestartRequest } from "./node-card";
import { EndpointSettings } from "./endpoint-settings";
import { PveThresholdsModal } from "./pve-thresholds-modal";
import { DEFAULT_PVE_THRESHOLDS, buildThresholds, countPveAlerts, nodeHasBreach, type PveThresholds } from "@/lib/pve-alerts";
import { useToast } from "@/components/toast-provider";
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
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<PveClusterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<PveEndpointConfig[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [thresholds, setThresholds] = useState<PveThresholds>(DEFAULT_PVE_THRESHOLDS);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [breachOnly, setBreachOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const fetchThresholds = useCallback(async () => {
    try {
      const res = await fetch("/api/pve/thresholds");
      if (res.ok) {
        const data = (await res.json()) as { config?: PveThresholds };
        setThresholds(buildThresholds(data.config));
      }
    } catch {
      // non-critical
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchStatus();
    fetchEndpoints();
    fetchThresholds();
  }, [fetchStatus, fetchEndpoints, fetchThresholds]);

  // Poll status every 30s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ── Render helpers ──────────────────────────────────────────────────────

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
  const breachCount = hasEndpoints ? countPveAlerts(status.endpoints, thresholds).count : 0;
  const showBreachFilter = hasEndpoints && breachCount > 0;

  // Global type-to-search: when focus is outside an editable field, printable
  // keystrokes are redirected to the live search input so the user can start
  // filtering without first clicking the box.
  useEffect(() => {
    if (!hasEndpoints) return;
    const input = searchInputRef.current;
    if (!input) return;
    let rafId: number | null = null;

    const isEditable = (el: Element | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier shortcuts and function keys.
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length !== 1) return;
      // Don't pull focus out of a modal or away from another editable field.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (isEditable(document.activeElement)) return;
      input.focus();
      e.preventDefault();
      const value = input.value;
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const next = value.slice(0, start) + e.key + value.slice(end);
      setQuery(next);
      // Restore caret after the inserted character on next frame.
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        input.setSelectionRange(start + 1, start + 1);
        rafId = null;
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [hasEndpoints]);

  const handleRefresh = useCallback(() => {
    fetchStatus();
    fetchEndpoints();
    fetchThresholds();
  }, [fetchStatus, fetchEndpoints, fetchThresholds]);

  const handleRestartGuest = useCallback(async (endpointId: number, endpointName: string, guest: GuestRestartRequest) => {
    const guestType = guest.type === "vm" ? "VM" : "LXC container";
    if (!window.confirm(`Restart ${guestType} ${guest.name} (ID ${guest.vmid}) on endpoint ${endpointName}, node ${guest.node}?`)) return;

    try {
      const res = await fetch("/api/pve/guests/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId,
          node: guest.node,
          vmid: guest.vmid,
          type: guest.type,
        }),
      });
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.push(`/?run_macro=${body.macroId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast?.showToast(`Unable to prepare restart: ${message}`, "error");
    }
  }, [router, toast]);

  // ── Search filtering (client-side) ──────────────────────────────────────

  const queryActive = query.trim().length > 0;

  /**
   * Sections visible under the current query and breach-only filter. Empty
   * query → everything. Otherwise a node is kept if it (or its guests/storage)
   * matches. In breach-only mode only nodes with at least one breaching resource
   * are shown. Endpoint sections are kept if their header matches or ≥1 node
   * survives.
   */
  const sections = useMemo(() => {
    if (!status) return [];
    const q = query.trim().toLowerCase();
    const includes = (value: string) => value.toLowerCase().includes(q);
    return status.endpoints
      .map((ep, ei) => {
        const endpointName = endpoints.find((e) => e.apiUrl === ep.apiUrl)?.name ?? ep.apiUrl;
        const nodeDetails = ep.nodes.map(detailFromApi);
        const filtered = breachOnly
          ? nodeDetails.filter((nd) => nodeHasBreach(nd, thresholds))
          : nodeDetails;
        if (!q) {
          return { ep, ei, endpointName, nodeDetails: filtered, endpointMatches: true };
        }
        const endpointMatches = includes(ep.name) || includes(ep.apiUrl) || includes(endpointName);
        const matching = filtered.filter((nd) => {
          const m = matchNodeQuery(q, nd);
          return endpointMatches || m.node || m.vms || m.containers || m.storage;
        });
        return { ep, ei, endpointName, nodeDetails: matching, endpointMatches };
      })
      .filter((s) => s.endpointMatches || s.nodeDetails.length > 0);
  }, [status, endpoints, query, breachOnly, thresholds]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-outline-variant/30 shrink-0">
        <div>
          <h1 className="text-xl font-bold font-display text-on-surface">Proxmox VE</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {hasEndpoints
              ? `${totalEndpoints} endpoint${totalEndpoints !== 1 ? "s" : ""} · ${totalVMs} VM${totalVMs !== 1 ? "s" : ""} · ${totalLXC} container${totalLXC !== 1 ? "s" : ""}`
              : "Virtual environment monitor"}
            {lastUpdated && <span className="ml-2 text-on-surface-variant/60">Last updated: {lastUpdated}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
          <button
            onClick={() => setThresholdsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">monitoring</span>
            Thresholds
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

      {/* Top-level live search + breach-only filter */}
      {hasEndpoints && (
        <div className="px-6 py-3 border-b border-outline-variant/30 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <span aria-hidden="true" className="material-symbols-outlined text-sm absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                search
              </span>
              <input
                ref={searchInputRef}
                id="pve-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes, VMs, containers, storage…"
                aria-label="Search Proxmox"
                autoFocus
                className="w-full bg-surface-container-high border border-outline-variant/50 pl-9 pr-9 py-2 text-sm text-on-surface transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none rounded-[var(--radius-button)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
            {showBreachFilter && (
              <button
                type="button"
                onClick={() => setBreachOnly((prev) => !prev)}
                aria-pressed={breachOnly}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 active:scale-[0.98] ${
                  breachOnly
                    ? "bg-error/20 text-error border border-error/30 hover:bg-error/30"
                    : "bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25"
                }`}
                aria-label={breachOnly ? "Show all Proxmox resources" : `Show only ${breachCount} breaching resource${breachCount !== 1 ? "s" : ""}`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm">warning</span>
                {breachOnly ? "Show all" : `${breachCount} breach${breachCount !== 1 ? "es" : ""}`}
              </button>
            )}
          </div>
        </div>
      )}

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
        ) : queryActive && sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">search_off</span>
            <p className="text-sm">
              No Proxmox resources match <span className="font-mono text-on-surface">&ldquo;{query}&rdquo;</span>.
            </p>
            <button
              onClick={() => setQuery("")}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Clear search
            </button>
          </div>
        ) : breachOnly && sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-warning/40">warning</span>
            <p className="text-sm">No resources are currently breaching the configured thresholds.</p>
            <button
              onClick={() => setBreachOnly(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Show all resources
            </button>
          </div>
        ) : (
          sections.map(({ ep, ei, endpointName, nodeDetails }) => {
            return (
              <div key={`ep-${ep.id}`} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-sm font-semibold text-on-surface font-display">{endpointName}</h2>
                  <EndpointStatusPill online={ep.online} />
                  <span className="text-[10px] text-on-surface-variant font-mono truncate max-w-[200px] sm:max-w-none">
                    {ep.apiUrl}
                  </span>
                </div>
                {nodeDetails.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-on-surface-variant bg-surface-container/30 rounded-[var(--radius-card)] border border-outline-variant/20">
                    <p>No nodes available on this endpoint.</p>
                  </div>
                ) : (
                  nodeDetails.map((nd) => (
                    <NodeCard
                      key={`node-${nd.node.node}-${ep.apiUrl}`}
                      node={nd}
                      endpointName={endpointName}
                      query={query}
                      thresholds={thresholds}
                      breachOnly={breachOnly}
                      onRestartGuest={(guest) => handleRestartGuest(ep.id, endpointName, guest)}
                    />
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

      {thresholdsOpen && (
        <PveThresholdsModal
          open={thresholdsOpen}
          onClose={() => setThresholdsOpen(false)}
          onSaved={() => fetchThresholds()}
        />
      )}
    </div>
  );
}
