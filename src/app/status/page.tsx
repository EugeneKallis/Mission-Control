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
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
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
  if (pct > 80) return "#FFB4AB";
  if (pct > 50) return "#FFD04C";
  return "#618B6B";
}

function UsageBar({ pct }: { pct: number | null }) {
  const value = pct ?? 0;
  const color = usageColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(59, 75, 63, 0.3)" }}>
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
          <div className="flex items-baseline gap-4">
            <h1 className="text-2xl font-bold text-[#E5E2E1] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              Server Status
            </h1>
            <span className="text-xs text-[#849587] font-mono">v0.1.0</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-semibold rounded-none transition-colors"
              style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              Add Server
            </button>
            <button
              onClick={handleUpdateAll}
              disabled={agents.length === 0}
              className="px-4 py-2 text-xs font-semibold rounded-none transition-colors disabled:opacity-50"
              style={{ background: "rgba(97, 139, 107, 0.1)", color: "#618B6B", border: "1px solid rgba(97, 139, 107, 0.3)" }}
            >
              Update All
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#849587]">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#849587] gap-3">
            <span className="material-symbols-outlined text-4xl">dns</span>
            <p>No agents connected.</p>
            <p className="text-xs">Agents will appear here once they connect back to the server.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#3B4B3F transparent" }}>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#849587] uppercase tracking-wider">
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
                        className="group"
                        style={{
                          opacity: isStale ? 0.5 : 1,
                          borderBottom: "1px solid rgba(59, 75, 63, 0.15)",
                        }}
                      >
                        <td className="p-3 font-medium text-[#E5E2E1]">{agent.hostname}</td>
                        <td className="p-3 text-[#849587] font-mono text-xs">{agent.ipAddress || "—"}</td>
                        <td className="p-3 min-w-[140px]"><UsageBar pct={agent.cpuUsage} /></td>
                        <td className="p-3 min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <UsageBar pct={memPct} />
                            {agent.memoryUsed !== null && agent.memoryTotal !== null && (
                              <span className="text-xs text-[#849587] whitespace-nowrap">
                                {formatBytes(agent.memoryUsed)} / {formatBytes(agent.memoryTotal)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right text-[#849587] text-xs font-mono">{formatBytes(agent.networkSent)}</td>
                        <td className="p-3 text-right text-[#849587] text-xs font-mono">{formatBytes(agent.networkRecv)}</td>
                        <td className="p-3">
                          <span className="text-xs text-[#849587]">{agent.version || "—"}</span>
                        </td>
                        <td className="p-3 text-xs text-[#849587] whitespace-nowrap">{formatTime(agent.lastSeen)}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleUpdateAgent(agent.id)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-none"
                              style={{ background: "rgba(97, 139, 107, 0.1)", color: "#618B6B", border: "1px solid rgba(97, 139, 107, 0.3)" }}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => handleRestartAgent(agent.id)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-none"
                              style={{ background: "rgba(255, 180, 171, 0.1)", color: "#FFB4AB", border: "1px solid rgba(255, 180, 171, 0.3)" }}
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
                    className="p-4 rounded-lg space-y-3"
                    style={{
                      opacity: isStale ? 0.5 : 1,
                      background: "#201F1F",
                      border: "1px solid rgba(59, 75, 63, 0.3)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#E5E2E1]">{agent.hostname}</span>
                      <span className="text-xs text-[#849587]">{agent.ipAddress || "—"}</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[#849587]">CPU </span>
                        <UsageBar pct={agent.cpuUsage} />
                      </div>
                      <div>
                        <span className="text-[#849587]">Memory </span>
                        <UsageBar pct={memPct} />
                        {agent.memoryUsed !== null && agent.memoryTotal !== null && (
                          <span className="text-[#849587] ml-2">{formatBytes(agent.memoryUsed)} / {formatBytes(agent.memoryTotal)}</span>
                        )}
                      </div>
                      <div className="flex justify-between text-[#849587]">
                        <span>Net Up: {formatBytes(agent.networkSent)}</span>
                        <span>Net Down: {formatBytes(agent.networkRecv)}</span>
                      </div>
                      <div className="flex justify-between text-[#849587]">
                        <span>v{agent.version || "—"}</span>
                        <span>Seen: {formatTime(agent.lastSeen)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleUpdateAgent(agent.id)}
                        className="flex-1 px-4 py-2 text-xs font-semibold rounded-none"
                        style={{ background: "rgba(97, 139, 107, 0.1)", color: "#618B6B", border: "1px solid rgba(97, 139, 107, 0.3)" }}
                      >
                        Update
                      </button>
                      <button
                        onClick={() => handleRestartAgent(agent.id)}
                        className="flex-1 px-4 py-2 text-xs font-semibold rounded-none"
                        style={{ background: "rgba(255, 180, 171, 0.1)", color: "#FFB4AB", border: "1px solid rgba(255, 180, 171, 0.3)" }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="w-full max-w-lg rounded-lg p-6"
            style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#E5E2E1]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                Add Server
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-[#849587] hover:text-[#E5E2E1] transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-[#849587] mb-3">
              Run this command on the server you want to connect:
            </p>
            <pre
              className="p-3 rounded text-xs font-mono text-[#E5E2E1] overflow-x-auto select-all"
              style={{ background: "#0E0E0E", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              curl -sL {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/agent/install | bash
            </pre>
            <button
              onClick={() => {
                const text = `curl -sL ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/agent/install | bash`;
                navigator.clipboard.writeText(text);
                showToast("Copied to clipboard", "success");
              }}
              className="mt-3 px-4 py-2 text-xs font-semibold rounded-none transition-colors"
              style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
