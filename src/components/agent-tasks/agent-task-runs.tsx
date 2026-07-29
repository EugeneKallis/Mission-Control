"use client";

import { useEffect, useState } from "react";
import type { HistoryRun } from "./agent-task-types";

interface Props {
  taskId: number;
}

function statusColors(status: string): { foreground: string; background: string } {
  // Agent tasks use "error" while the shared status tokens use "failed".
  switch (status) {
    case "success":
      return { foreground: "var(--status-success-fg)", background: "var(--status-success-bg)" };
    case "error":
      return { foreground: "var(--status-failed-fg)", background: "var(--status-failed-bg)" };
    case "running":
      return { foreground: "var(--status-running-fg)", background: "var(--status-running-bg)" };
    default:
      return {
        foreground: "var(--color-on-surface-variant)",
        background: "color-mix(in srgb, var(--color-on-surface-variant) 10%, transparent)",
      };
  }
}

export function AgentTaskRuns({ taskId }: Props) {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`/api/agent-tasks/${taskId}/runs?limit=10`);
      const data = await res.json() as { history: HistoryRun[] };
      setRuns(data.history);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Derived: is any run currently in-flight? Drives the polling effect
  // below so the interval re-evaluates on every status change, instead of
  // capturing a stale `runs` from the first render (the old dead closure).
  const hasRunning = runs.some((r) => r.status === "running");

  // Fetch on mount / when the selected task changes.
  useEffect(() => {
    void fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Poll only while a run is in-flight; stops automatically once it settles.
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => void fetchRuns(), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRunning]);

  return (
    <div className="p-3 space-y-2" style={{ background: "rgba(0,0,0,0.15)", maxHeight: "300px", overflow: "auto" }}>
      <div className="text-xs font-semibold text-on-surface-variant mb-1">Recent Runs</div>

      {loading && <div className="text-xs text-on-surface-variant/60">Loading…</div>}
      {!loading && runs.length === 0 && (
        <div className="text-xs text-on-surface-variant/60">No runs yet.</div>
      )}

      {runs.map((run) => (
        <div key={run.id}>
          <button
            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
            className="w-full flex items-center justify-between text-left px-2 py-1.5 rounded transition-colors"
            style={{
              background: expandedRun === run.id ? "rgba(255,255,255,0.03)" : "transparent",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: statusColors(run.status).foreground }}
              />
              <span className="text-xs text-on-surface">
                {new Date(run.startTime).toLocaleString()}
              </span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: statusColors(run.status).background,
                  color: statusColors(run.status).foreground,
                }}
              >
                {run.status}
              </span>
            </div>
            {run.endTime && (
              <span className="text-[10px] text-on-surface-variant/60">
                {((new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000).toFixed(1)}s
              </span>
            )}
          </button>

          {expandedRun === run.id && run.output && (
            <pre
              className="mt-1 p-2 rounded text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-[200px]"
              style={{
                background: "var(--terminal-bg)",
                color: "var(--terminal-fg)",
                border: "1px solid var(--terminal-border)",
              }}
            >
              {run.output}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
