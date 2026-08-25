"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EndpointSettings } from "./endpoint-settings";
import { DockerLogViewer } from "./docker-log-viewer";
import {
  DOCKER_LOGS_STORAGE_KEY,
  getStats,
  type DozzleContainer,
  type DozzleContainerEvent,
  type DozzleEndpointConfig,
  type DozzleStat,
} from "@/lib/docker-logs";

interface EndpointRuntime {
  containers: DozzleContainer[];
  stats: Record<string, DozzleStat>;
  connected: boolean;
  hasConnected: boolean;
}

type SelectedContainer = { endpointId: number; container: DozzleContainer };

function baseRuntime(): EndpointRuntime {
  return { containers: [], stats: {}, connected: false, hasConnected: false };
}

function readCollapsed(): Record<number, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(DOCKER_LOGS_STORAGE_KEY) ?? "{}");
    return stored.collapsed && typeof stored.collapsed === "object" ? stored.collapsed : {};
  } catch {
    return {};
  }
}

function writeCollapsed(collapsed: Record<number, boolean>) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DOCKER_LOGS_STORAGE_KEY) ?? "{}");
    window.localStorage.setItem(DOCKER_LOGS_STORAGE_KEY, JSON.stringify({ ...stored, collapsed }));
  } catch {
    // Visual preferences are best effort.
  }
}

function statFor(container: DozzleContainer, runtime: EndpointRuntime): DozzleStat | undefined {
  return runtime.stats[container.id] ?? getStats(container.stats).at(-1);
}

function formatPercent(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function formatMemory(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function eventState(name: string): string | null {
  if (name === "start" || name === "container-started") return "running";
  if (name === "die" || name === "stop" || name === "container-stopped") return "exited";
  return null;
}

export function DockerLogsPage() {
  const [endpoints, setEndpoints] = useState<DozzleEndpointConfig[]>([]);
  const [runtime, setRuntime] = useState<Record<number, EndpointRuntime>>({});
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(readCollapsed);
  const [selected, setSelected] = useState<SelectedContainer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sourcesRef = useRef(new Map<number, EventSource>());

  const fetchEndpoints = useCallback(async () => {
    try {
      const response = await fetch("/api/docker-logs/endpoints", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setEndpoints(await response.json() as DozzleEndpointConfig[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEndpoints();
  }, [fetchEndpoints]);

  useEffect(() => {
    for (const source of sourcesRef.current.values()) source.close();
    sourcesRef.current.clear();

    const activeSources = sourcesRef.current;

    for (const endpoint of endpoints.filter((item) => item.enabled)) {
      const source = new EventSource(`/api/docker-logs/endpoints/${endpoint.id}/events/stream`);
      sourcesRef.current.set(endpoint.id, source);

      const update = (change: (state: EndpointRuntime) => EndpointRuntime) => {
        setRuntime((current) => ({
          ...current,
          [endpoint.id]: change(current[endpoint.id] ?? baseRuntime()),
        }));
      };

      source.onopen = () => {
        update((state) => ({ ...state, connected: true, hasConnected: true }));
      };
      source.onerror = () => {
        update((state) => ({ ...state, connected: false, hasConnected: true }));
      };
      source.addEventListener("containers-changed", (event) => {
        try {
          const containers = JSON.parse((event as MessageEvent).data) as DozzleContainer[];
          if (!Array.isArray(containers)) return;
          const stats = {} as Record<string, DozzleStat>;
          for (const container of containers) {
            const latest = getStats(container.stats).at(-1);
            if (latest) stats[container.id] = { ...latest, id: container.id };
          }
          update((state) => ({ ...state, containers, stats }));
        } catch {
          // Ignore malformed events from an incompatible upstream.
        }
      });
      source.addEventListener("container-stat", (event) => {
        try {
          const stat = JSON.parse((event as MessageEvent).data) as DozzleStat;
          if (!stat.id) return;
          update((state) => ({ ...state, stats: { ...state.stats, [stat.id as string]: stat } }));
        } catch {
          // Ignore malformed stats.
        }
      });
      source.addEventListener("container-health", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { actorId?: string; health?: string };
          if (!data.actorId) return;
          update((state) => ({
            ...state,
            containers: state.containers.map((container) => container.id === data.actorId ? { ...container, health: data.health } : container),
          }));
        } catch {
          // Ignore malformed health events.
        }
      });
      source.addEventListener("container-event", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as DozzleContainerEvent;
          const nextState = eventState(data.name);
          if (data.name === "destroy" || data.name === "container-destroyed") {
            update((state) => ({ ...state, containers: state.containers.filter((container) => container.id !== data.actorId) }));
          } else if (nextState) {
            update((state) => ({
              ...state,
              containers: state.containers.map((container) => container.id === data.actorId ? { ...container, state: nextState } : container),
            }));
          }
        } catch {
          // Ignore malformed container events.
        }
      });
    }

    return () => {
      for (const source of activeSources.values()) source.close();
      activeSources.clear();
    };
  }, [endpoints]);

  const toggleCollapsed = useCallback((id: number) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      writeCollapsed(next);
      return next;
    });
  }, []);

  const sections = useMemo(() => {
    const search = query.trim().toLowerCase();
    return endpoints
      .filter((endpoint) => endpoint.enabled)
      .map((endpoint) => {
        const state = runtime[endpoint.id] ?? baseRuntime();
        const endpointMatches = endpoint.name.toLowerCase().includes(search);
        const containers = state.containers
          .filter((container) => endpointMatches || [container.name, container.image, container.state, container.id].some((value) => value.toLowerCase().includes(search)))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { endpoint, state, containers };
      })
      .filter(({ containers }) => !search || containers.length > 0);
  }, [endpoints, query, runtime]);

  const enabledCount = endpoints.filter((endpoint) => endpoint.enabled).length;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <header className="px-6 py-5 border-b border-outline-variant/30 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-56">
            <h1 className="text-2xl font-bold font-display text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">terminal</span>
              Docker Logs
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">Live container logs across configured Docker instances.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[var(--radius-button)] bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">settings</span>
            Manage Instances
          </button>
        </div>
        <div className="relative mt-4 max-w-xl">
          <span className="material-symbols-outlined text-sm absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" aria-hidden="true">search</span>
          <input
            type="search"
            aria-label="Search Docker containers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search instances, containers, images…"
            className="w-full bg-surface-container-high border border-outline-variant/50 pl-9 pr-9 py-2 text-sm text-on-surface outline-none focus:border-primary rounded-[var(--radius-button)]"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded-full text-on-surface-variant hover:text-on-surface">×</button>}
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
        {error && <div className="px-4 py-3 rounded-[var(--radius-card)] text-sm text-error bg-error/10 border border-error/30">Unable to load Docker Logs instances: {error}</div>}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-on-surface-variant">Loading Docker Logs…</div>
        ) : enabledCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl opacity-30" aria-hidden="true">dns</span>
            <p className="text-sm">No enabled Docker Logs instances configured.</p>
            <button type="button" onClick={() => setSettingsOpen(true)} className="px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] bg-primary text-on-primary hover:bg-primary-dim transition-colors">
              Manage Instances
            </button>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl opacity-30" aria-hidden="true">search_off</span>
            <p className="text-sm">No containers match <span className="font-mono text-on-surface">{query}</span>.</p>
          </div>
        ) : (
          sections.map(({ endpoint, state, containers }) => {
            const isCollapsed = collapsed[endpoint.id] === true;
            const statusLabel = state.connected ? "connected" : state.hasConnected ? "unreachable" : "connecting…";
            const statusColor = state.connected ? "bg-success" : state.hasConnected ? "bg-error" : "bg-warning";
            return (
              <section key={endpoint.id} className={`rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container/40 overflow-hidden ${!state.connected && state.hasConnected ? "opacity-80" : ""}`}>
                <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container/70 transition-colors" onClick={() => toggleCollapsed(endpoint.id)} aria-expanded={!isCollapsed}>
                  <span className={`size-2.5 rounded-full shrink-0 ${statusColor}`} />
                  <span className="font-semibold text-on-surface">{endpoint.name}</span>
                  <span className={`text-[10px] uppercase tracking-wider ${state.connected ? "text-success" : state.hasConnected ? "text-error" : "text-warning"}`}>{statusLabel}</span>
                  <span className="text-xs text-on-surface-variant">{containers.length} container{containers.length === 1 ? "" : "s"}</span>
                  <span className="material-symbols-outlined text-sm text-on-surface-variant ml-auto" aria-hidden="true">{isCollapsed ? "expand_more" : "expand_less"}</span>
                </button>
                {!isCollapsed && (
                  containers.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-on-surface-variant border-t border-outline-variant/20">No containers reported by this instance.</div>
                  ) : (
                    <div className="overflow-x-auto border-t border-outline-variant/20">
                      <div className="min-w-[720px]">
                        <div className="grid grid-cols-[minmax(220px,2fr)_minmax(160px,1.5fr)_100px_100px_120px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-on-surface-variant/60">
                          <span>Container</span><span>Image</span><span>State</span><span>CPU</span><span>Memory</span>
                        </div>
                        {containers.map((container) => {
                          const stat = statFor(container, state);
                          const unhealthy = container.health === "unhealthy";
                          return (
                            <button
                              type="button"
                              key={container.id}
                              onClick={() => setSelected({ endpointId: endpoint.id, container })}
                              className="w-full grid grid-cols-[minmax(220px,2fr)_minmax(160px,1.5fr)_100px_100px_120px] gap-3 items-center px-4 py-3 text-left border-t border-outline-variant/15 hover:bg-surface-container-high/60 transition-colors"
                            >
                              <span className="min-w-0 flex items-center gap-2">
                                <span className={`size-2 rounded-full shrink-0 ${container.state === "running" ? unhealthy ? "bg-error" : "bg-success" : "bg-on-surface-variant/50"}`} />
                                <span className="truncate text-sm text-on-surface font-medium">{container.name}</span>
                                {container.health && <span className="text-[10px] text-on-surface-variant">{container.health}</span>}
                              </span>
                              <span className="truncate text-xs text-on-surface-variant font-mono" title={container.image}>{container.image}</span>
                              <span className="text-xs text-on-surface-variant capitalize">{container.state}</span>
                              <span className="text-xs text-on-surface-variant font-mono">{formatPercent(stat?.cpu)}</span>
                              <span className="text-xs text-on-surface-variant font-mono">{formatPercent(stat?.memory)} <span className="text-on-surface-variant/60">{formatMemory(stat?.memoryUsage)}</span></span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </section>
            );
          })
        )}
      </main>

      {settingsOpen && <EndpointSettings endpoints={endpoints} onClose={() => setSettingsOpen(false)} onSaved={fetchEndpoints} />}
      {selected && <DockerLogViewer endpointId={selected.endpointId} container={selected.container} onClose={() => setSelected(null)} />}
    </div>
  );
}
