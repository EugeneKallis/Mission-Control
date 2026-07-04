"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveStream } from "@/hooks/use-live-stream";
import { formatSeconds } from "@/lib/format";

function formatDuration(start: string, end: string | null): string {
  if (!end) return "running…";
  return formatSeconds(Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}
import { useToast } from "@/components/toast-provider";

interface HistoryItem {
  id: number;
  macroId: number;
  startTime: string;
  endTime: string | null;
  status: string;
  output: string | null;
  triggeredBy: string;
  macro: { name: string };
}

function statusPill(status: string) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    running: { bg: "rgba(76, 214, 255, 0.1)", fg: "#4CD6FF", border: "rgba(76, 214, 255, 0.3)" },
    success: { bg: "rgba(97, 139, 107, 0.1)", fg: "#618B6B", border: "rgba(97, 139, 107, 0.3)" },
    failed: { bg: "rgba(255, 180, 171, 0.1)", fg: "#FFB4AB", border: "rgba(255, 180, 171, 0.3)" },
  };
  const c = colors[status] || colors.running;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {status}
    </span>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}



/**
 * MacroLogPanel — live terminal + history list for the admin page.
 *
 * Shows:
 *  - Live output from the SSE stream at /api/ws (filtered to the running macro)
 *  - Recent history rows from /api/history (clickable → /history/[id])
 *
 * Props:
 *  - runningMacroId: the macro currently running (null = no filter)
 *  - runningMacroName: display name for the running macro
 *  - onClose: called when user closes the panel
 */
export function MacroLogPanel({
  runningMacroId,
  runningMacroName,
  onClose,
}: {
  runningMacroId: number | null;
  runningMacroName: string;
  onClose: () => void;
}) {
  const { lines, isConnected, clearLines, containerRef, handleScroll } = useLiveStream();
  const toast = useToast();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const wasRunningRef = useRef(false);

  // Fetch history on mount and poll every 5s
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // When a macro starts running, clear the terminal so the new run
  // isn't mixed with output from a previous run.
  useEffect(() => {
    if (runningMacroId !== null && !wasRunningRef.current) {
      wasRunningRef.current = true;
      clearLines();
    } else if (runningMacroId === null && wasRunningRef.current) {
      wasRunningRef.current = false;
    }
  }, [runningMacroId, clearLines]);

  const handleExport = useCallback(() => {
    if (lines.length === 0) return;
    const blob = new Blob([lines.join("")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macro-log-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast?.showToast("Logs exported", "info");
  }, [lines, toast]);

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden shrink-0"
      style={{
        background: "#0E0E0E",
        border: "1px solid rgba(59, 75, 63, 0.3)",
        height: "400px",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ background: "#131313", borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <span className="material-symbols-outlined text-sm text-[#618B6B]">terminal</span>
        <span className="text-xs font-medium text-[#E5E2E1] truncate">
          {runningMacroId !== null ? `Running: ${runningMacroName}` : "Log History"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-[#618B6B] animate-pulse" : "bg-[#FFB4AB]"
            }`}
          />
          <span className="text-[10px] text-[#849587] font-mono">
            {isConnected ? "LIVE" : "OFFLINE"}
          </span>
          <button
            onClick={handleExport}
            className="p-1 text-[#849587] hover:text-[#E5E2E1] transition-colors"
            title="Export current log"
          >
            <span className="material-symbols-outlined text-sm">download</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#849587] hover:text-[#E5E2E1] transition-colors"
            title="Close panel"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Terminal + History split */}
      <div className="flex-1 min-h-0 flex">
        {/* Terminal (left) */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: "1px solid rgba(59, 75, 63, 0.15)" }}>
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 p-3 font-mono text-[11px] leading-relaxed overflow-y-auto terminal-glow"
            style={{ color: "#E5E2E1" }}
            tabIndex={0}
          >
            {lines.length === 0 ? (
              <div className="text-[#849587]/60 italic">
                {runningMacroId !== null
                  ? `Waiting for output from "${runningMacroName}"…`
                  : "No live output. Run a macro to see output here."}
              </div>
            ) : (
              lines.map((line, i) => (
                <div
                  key={i}
                  className="whitespace-pre-wrap break-words"
                  style={{ animation: "fade-up 0.12s ease-out both" }}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* History (right) */}
        <div className="w-72 shrink-0 flex flex-col min-h-0">
          <div
            className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#618B6B] shrink-0"
            style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.15)" }}
          >
            Recent Runs
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {historyLoading ? (
              <div className="px-3 py-2 text-[10px] text-[#849587]">Loading…</div>
            ) : history.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-[#849587]">No history yet.</div>
            ) : (
              history.slice(0, 20).map((item) => (
                <Link
                  key={item.id}
                  href={`/history/${item.id}`}
                  className="block px-3 py-1.5 hover:bg-[#1C1B1B] transition-colors"
                  style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.08)" }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] text-[#E5E2E1] truncate flex-1">
                      {item.macro.name}
                    </span>
                    {statusPill(item.status)}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-[#849587] font-mono">
                    <span>{formatTime(item.startTime)}</span>
                    <span>·</span>
                    <span>{formatDuration(item.startTime, item.endTime)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
          <Link
            href="/history"
            className="px-3 py-1.5 text-[10px] text-[#618B6B] hover:underline text-center shrink-0"
            style={{ borderTop: "1px solid rgba(59, 75, 63, 0.15)" }}
          >
            View all history →
          </Link>
        </div>
      </div>
    </div>
  );
}
