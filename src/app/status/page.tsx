"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/toast-provider";

interface Agent {
  id: number;
  hostname: string;
  ipAddress: string | null;
  cpuUsage: number | null;
  memoryTotal: number | null;
  memoryUsed: number | null;
  lastSeen: string | null;
  version: string | null;
  updateRequested: boolean;
  restartRequested: boolean;
  networkSent: number | null;
  networkRecv: number | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York",
  });
}

function usageColor(pct: number): string {
  if (pct > 80) return "#F87171";
  if (pct > 50) return "#FBBF24";
  return "#34D399";
}

function UsageBar({ pct }: { pct: number | null }) {
  const value = pct ?? 0;
  const color = usageColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-outline-variant/30">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  );
}

export default function ServerStatusPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const { showToast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    intervalRef.current = setInterval(fetchAgents, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAgents]);

  const handleUpdateAll = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/request-update-all", { method: "POST" });
      if (res.ok) {
        showToast("Update requested for all agents", "success");
      } else {
        showToast("Failed to request updates", "error");
      }
    } catch {
      showToast("Failed to request updates", "error");
    }
  }, [showToast]);

  const handleUpdateAgent = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/agent/request-update/${id}`, { method: "POST" });
      if (res.ok) {
        showToast("Update requested", "success");
      } else {
        showToast("Failed to request update", "error");
      }
    } catch {
      showToast("Failed to request update", "error");
    }
  }, [showToast]);

  const handleRestartAgent = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/agent/request-restart/${id}`, { method: "POST" });
      if (res.ok) {
        showToast("Restart requested", "success");
      } else {
        showToast("Failed to request restart", "error");
      }
    } catch {
      showToast("Failed to request restart", "error");
    }
  }, [showToast]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 relative h-full flex flex-col gap-6 stagger-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              Server Status
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Connected agents and system resources
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Server
            </button>
            <button
              onClick={handleUpdateAll}
              disabled={agents.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-success/10 text-success border border-success/30 hover:bg-success/20 disabled:opacity-50 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Update All
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">dns</span>
            <p className="text-sm">No agents connected.</p>
            <p className="text-xs text-on-surface-variant/60">Agents will appear here once they connect back to the server.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-on-surface-variant uppercase tracking-wider">
                    <th className="p-3 text-left font-normal">Hostname</th>
                    <th className="p-3 text-left font-normal">IP</th>
                    <th className="p-3 text-left font-normal">CPU</th>
                    <th className="p-3 text-left font-normal">Memory</th>
                    <th className="p-3 text-right font-normal">Net Up</th>
                    <th className="p-3 text-right font-normal">Net Down</th>
                    <th className="p-3 text-left font-normal">Version</th>
                    <th className="p-3 text-left font-normal">Last Seen</th>
                    <th className="p-3 text-right font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const memPct = agent.memoryTotal && agent.memoryUsed
                      ? (agent.memoryUsed / agent.memoryTotal) * 100
                      : null;
                    const isStale = agent.lastSeen && (Date.now() - new Date(agent.lastSeen).getTime()) > 60000;

                    return (
                      <tr
                        key={agent.id}
                        className="group transition-opacity"
                        style={{
                          opacity: isStale ? 0.5 : 1,
                          borderBottom: "1px solid rgba(71, 85, 105, 0.15)",
                        }}
                      >
                        <td className="p-3 font-medium text-on-surface">{agent.hostname}</td>
                        <td className="p-3 text-on-surface-variant font-mono text-xs">{agent.ipAddress || "\u2014"}</td>
                        <td className="p-3 min-w-[140px]"><UsageBar pct={agent.cpuUsage} /></td>
                        <td className="p-3 min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <UsageBar pct={memPct} />
                            {agent.memoryUsed !== null && agent.memoryTotal !== null && (
                              <span className="text-xs text-on-surface-variant whitespace-nowrap">
                                {formatBytes(agent.memoryUsed)} / {formatBytes(agent.memoryTotal)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right text-on-surface-variant text-xs font-mono">{formatBytes(agent.networkSent)}</td>
                        <td className="p-3 text-right text-on-surface-variant text-xs font-mono">{formatBytes(agent.networkRecv)}</td>
                        <td className="p-3">
                          <span className="text-xs text-on-surface-variant">{agent.version || "\u2014"}</span>
                        </td>
                        <td className="p-3 text-xs text-on-surface-variant whitespace-nowrap">{formatTime(agent.lastSeen)}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleUpdateAgent(agent.id)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-success/10 text-success border border-success/30 hover:bg-success/20 active:scale-[0.98]"
                            >
                              Update
                            </button>
                            <button
                              onClick={() => handleRestartAgent(agent.id)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-error/10 text-error border border-error/30 hover:bg-error/20 active:scale-[0.98]"
                            >
                              Restart
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {agents.map((agent) => {
                const memPct = agent.memoryTotal && agent.memoryUsed
                  ? (agent.memoryUsed / agent.memoryTotal) * 100
                  : null;
                const isStale = agent.lastSeen && (Date.now() - new Date(agent.lastSeen).getTime()) > 60000;

                return (
                  <div
                    key={agent.id}
                    className="p-4 rounded-[var(--radius-card)] space-y-3 border border-outline-variant/20 bg-surface-container-lowest/40"
                    style={{ opacity: isStale ? 0.5 : 1 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-on-surface">{agent.hostname}</span>
                      <span className="text-xs text-on-surface-variant">{agent.ipAddress || "\u2014"}</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-on-surface-variant">CPU </span>
                        <UsageBar pct={agent.cpuUsage} />
                      </div>
                      <div>
                        <span className="text-on-surface-variant">Memory </span>
                        <UsageBar pct={memPct} />
                        {agent.memoryUsed !== null && agent.memoryTotal !== null && (
                          <span className="text-on-surface-variant ml-2">{formatBytes(agent.memoryUsed)} / {formatBytes(agent.memoryTotal)}</span>
                        )}
                      </div>
                      <div className="flex justify-between text-on-surface-variant">
                        <span>Net Up: {formatBytes(agent.networkSent)}</span>
                        <span>Net Down: {formatBytes(agent.networkRecv)}</span>
                      </div>
                      <div className="flex justify-between text-on-surface-variant">
                        <span>v{agent.version || "\u2014"}</span>
                        <span>Seen: {formatTime(agent.lastSeen)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleUpdateAgent(agent.id)}
                        className="flex-1 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-success/10 text-success border border-success/30 hover:bg-success/20 active:scale-[0.98]"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => handleRestartAgent(agent.id)}
                        className="flex-1 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-error/10 text-error border border-error/30 hover:bg-error/20 active:scale-[0.98]"
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)" }}>
          <div className="w-full max-w-lg rounded-[var(--radius-card)] p-6 border border-outline-variant/30 bg-surface shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-on-surface font-display">
                Add Server
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors rounded-[var(--radius-button)] hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-on-surface-variant mb-3">
              Run this command on the server you want to connect:
            </p>
            <pre
              className="p-3 rounded text-xs font-mono text-on-surface overflow-x-auto select-all border border-outline-variant/30"
              style={{ background: "#0B1121" }}
            >
              curl -sL {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/agent/install | bash
            </pre>
            <button
              onClick={() => {
                const text = `curl -sL ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/agent/install | bash`;
                navigator.clipboard.writeText(text);
                showToast("Copied to clipboard", "success");
              }}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
