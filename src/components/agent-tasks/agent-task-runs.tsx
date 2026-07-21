"use client";

import { useEffect, useState, useRef } from "react";
import type { HistoryRun } from "./agent-task-types";

interface Props {
  taskId: number;
}

function statusColor(status: string): string {
  switch (status) {
    case "success": return "#618B6B";
    case "error": return "#FFB4AB";
    case "running": return "#FFD04C";
    default: return "#849587";
  }
}

export function AgentTaskRuns({ taskId }: Props) {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

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

  useEffect(() => {
    void fetchRuns();

    // Poll while there's a running run
    intervalRef.current = setInterval(() => {
      const hasRunning = runs.some((r) => r.status === "running");
      if (hasRunning) void fetchRuns();
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // Only re-run on taskId change, not on runs changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div className="p-3 space-y-2" style={{ background: "rgba(0,0,0,0.15)", maxHeight: "300px", overflow: "auto" }}>
      <div className="text-xs font-semibold text-[#849587] mb-1">Recent Runs</div>

      {loading && <div className="text-xs text-[#5A6B5E]">Loading…</div>}
      {!loading && runs.length === 0 && (
        <div className="text-xs text-[#5A6B5E]">No runs yet.</div>
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
                style={{ background: statusColor(run.status) }}
              />
              <span className="text-xs text-[#E5E2E1]">
                {new Date(run.startTime).toLocaleString()}
              </span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: `${statusColor(run.status)}20`,
                  color: statusColor(run.status),
                }}
              >
                {run.status}
              </span>
            </div>
            {run.endTime && (
              <span className="text-[10px] text-[#5A6B5E]">
                {((new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000).toFixed(1)}s
              </span>
            )}
          </button>

          {expandedRun === run.id && run.output && (
            <pre
              className="mt-1 p-2 rounded text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-[200px]"
              style={{
                background: "#0E0E0E",
                color: "#C5C8C6",
                border: "1px solid rgba(59, 75, 63, 0.2)",
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
