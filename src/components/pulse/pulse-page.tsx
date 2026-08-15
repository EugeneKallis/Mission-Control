"use client";

import { useCallback, useEffect, useState } from "react";
import { PULSE_URL } from "@/lib/pulse";

interface PulseHealth {
  status?: string;
  uptime?: number;
  timestamp?: number;
  dependencies?: Record<string, boolean>;
}

interface PulseVersion {
  version?: string;
  build?: string;
  deploymentType?: string;
  containerized?: boolean;
}

interface PulseSecurity {
  hasAuthentication?: boolean;
  requiresAuth?: boolean;
  ssoEnabled?: boolean;
}

export interface PulseSnapshot {
  fetchedAt: string;
  health: PulseHealth | null;
  version: PulseVersion | null;
  security: PulseSecurity | null;
  resourceCount: number | null;
  authenticated: boolean;
  resourcesError: string | null;
  errors: string[];
}

function formatUptime(seconds: number | undefined): string {
  if (!Number.isFinite(seconds) || seconds == null) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusPill({ healthy }: { healthy: boolean }) {
  const state = healthy ? "success" : "failed";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: `var(--status-${state}-bg)`,
        color: `var(--status-${state}-fg)`,
        border: `1px solid var(--status-${state}-border)`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(--status-${state}-fg)` }}
      />
      {healthy ? "Operational" : "Degraded"}
    </span>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">{label}</p>
      <p className="mt-2 text-lg font-semibold text-on-surface">{value}</p>
      {detail && <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>}
    </div>
  );
}

export function PulsePage() {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/pulse/status", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<PulseSnapshot> & { error?: string };
      if (!response.ok) {
        const endpointErrors = Array.isArray(body.errors) ? body.errors.join("; ") : undefined;
        throw new Error(body.error || endpointErrors || "Pulse public API is unavailable");
      }
      setSnapshot({
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        health: body.health ?? null,
        version: body.version ?? null,
        security: body.security ?? null,
        resourceCount: body.resourceCount ?? null,
        authenticated: body.authenticated ?? false,
        resourcesError: body.resourcesError ?? null,
        errors: body.errors ?? [],
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pulse public API is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Polling is the external synchronization boundary for this dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
    const interval = setInterval(() => fetchStatus(), 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const healthStatus = snapshot?.health?.status?.toLowerCase();
  const healthy = healthStatus === "healthy";
  const dependencies = snapshot?.health?.dependencies ?? {};
  const hasPartialErrors = Boolean(snapshot?.errors.length);
  const resourceDetail = !snapshot?.authenticated
    ? "API key not configured"
    : snapshot.resourceCount != null
      ? "Authenticated API"
      : "Key rejected or resources unavailable";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Pulse">
      <header className="flex shrink-0 flex-col gap-3 border-b border-outline-variant/30 bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">monitor_heart</span>
            <h1 className="text-xl font-bold font-display text-on-surface">Pulse Monitor</h1>
            {!loading && snapshot?.health && <StatusPill healthy={healthy} />}
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            Native overview from Pulse&apos;s public health API
            {snapshot?.fetchedAt && <span className="ml-2 text-on-surface-variant/60">Updated {new Date(snapshot.fetchedAt).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-outline-variant/40 px-3 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-base ${refreshing ? "animate-spin" : ""}`}>refresh</span>
            Refresh
          </button>
          <a
            href={PULSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">open_in_new</span>
            Full Pulse
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading && (
          <div className="flex min-h-48 items-center justify-center rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface" role="status">
            <span className="text-sm text-on-surface-variant">Loading Pulse status…</span>
          </div>
        )}

        {!loading && error && !snapshot && (
          <div className="rounded-[var(--radius-card)] border border-error/30 bg-error/10 p-5" role="alert">
            <h2 className="text-base font-semibold text-error">Pulse status unavailable</h2>
            <p className="mt-2 text-sm text-on-surface-variant">{error}</p>
            <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
              Open Pulse directly
            </a>
          </div>
        )}

        {!loading && snapshot && (
          <div className="space-y-5">
            {hasPartialErrors && (
              <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-on-surface" role="status">
                <p>Some public Pulse details could not be loaded. Authenticated dashboards remain available through <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Full Pulse</a>.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                  {snapshot.errors.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Status" value={snapshot.health?.status ?? "Unknown"} detail="Pulse health endpoint" />
              <MetricCard label="Uptime" value={formatUptime(snapshot.health?.uptime)} detail="Since Pulse started" />
              <MetricCard label="Version" value={snapshot.version?.version ?? "Unknown"} detail={snapshot.version?.build ?? "Build unavailable"} />
              <MetricCard label="Resources" value={snapshot.resourceCount == null ? "—" : String(snapshot.resourceCount)} detail={resourceDetail} />
              <MetricCard label="Authentication" value={snapshot.security?.requiresAuth ? "Required" : "Not required"} detail={snapshot.security?.ssoEnabled ? "SSO enabled" : "Local login"} />
            </div>

            <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">Pulse dependencies</h2>
                  <p className="mt-1 text-xs text-on-surface-variant">Public readiness signals reported by Pulse.</p>
                </div>
                <span className="text-xs text-on-surface-variant">{Object.values(dependencies).filter(Boolean).length}/{Object.keys(dependencies).length} ready</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {Object.entries(dependencies).map(([name, ready]) => (
                  <div key={name} className="flex items-center justify-between rounded-[var(--radius-button)] bg-surface-container px-3 py-2.5">
                    <span className="text-sm capitalize text-on-surface">{name}</span>
                    <span className={`text-xs font-semibold ${ready ? "text-success" : "text-error"}`}>{ready ? "Ready" : "Unavailable"}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface p-5">
              <h2 className="text-sm font-semibold text-on-surface">Detailed monitoring</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                Pulse protects its detailed infrastructure API behind its own authentication. When a Pulse API key is configured, this overview also reports the resource count from Pulse&apos;s authenticated resources API. Use Full Pulse for hosts, containers, alerts, logs, charts, and live WebSocket monitoring.
              </p>
              <a href={PULSE_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
                Open authenticated Pulse dashboard
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
