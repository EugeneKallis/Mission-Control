"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { formatSeconds } from "@/lib/format";

interface HistoryDetail {
  id: number;
  macroId: number | null;
  workerTimerId: number | null;
  startTime: string;
  endTime: string | null;
  status: string;
  output: string | null;
  triggeredBy: string;
  macro: { name: string } | null;
  workerTimer: { name: string } | null;
  agentTask: { name: string } | null;
}

function historyTitle(item: HistoryDetail): string {
  return item.workerTimer?.name ?? item.macro?.name ?? item.agentTask?.name ?? "Unknown";
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

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Running...";
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return formatSeconds(sec);
}

function statusPill(status: string) {
  const vars: Record<string, string> = {
    running: "running",
    success: "success",
    failed: "failed",
  };
  const key = vars[status] || "running";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: `var(--status-${key}-bg)`,
        color: `var(--status-${key}-fg)`,
        border: `1px solid var(--status-${key}-border)`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: `var(--status-${key}-fg)` }}
      />
      {status}
    </span>
  );
}

export default function HistoryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [item, setItem] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // Mirrors the latest item so the poll loop can read the current
  // status without re-creating the interval on every render.
  // Synced in an effect to avoid the React 19 lint rule against
  // mutating refs during render.
  const itemRef = useRef<HistoryDetail | null>(null);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/history/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data: HistoryDetail = await res.json();
      setItem(data);
      itemRef.current = data;
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setItem(null);
    itemRef.current = null;
    fetchItem();

    // The runner flushes the in-memory output buffer to the DB every
    // 1.5 s while a macro is running, so a 2 s poll cadence keeps the
    // terminal pane within ~1 poll of the latest content. Once the
    // status finalises, we drop back to 5 s (parity with the list
    // page) since the row no longer changes.
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (itemRef.current && itemRef.current.status !== "running") return;
      fetchItem();
    }, 2000);

    const onVisibilityChange = () => {
      if (!document.hidden) fetchItem();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchItem]);

  const isRunning = item?.status === "running";
  const terminalText = item?.output ?? "";

  return (
    <AppShell>
      <div className="p-4 md:p-6 h-full flex flex-col gap-5">
        {/* Back + header */}
        <div className="shrink-0">
          <Link href="/history" className="text-[var(--color-success)] hover:underline text-sm inline-flex items-center gap-1 mb-3">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </Link>

          {loading ? (
            <div className="text-on-surface-variant">Loading...</div>
          ) : error ? (
            <div className="text-[var(--status-failed-fg)]">{error}</div>
          ) : item ? (
            <>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-[var(--color-on-surface)] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                  Log: {historyTitle(item)}
                  {item.workerTimer && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none" style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", color: "var(--color-primary)" }}>
                      timer
                    </span>
                  )}
                </h1>
                {statusPill(item.status)}
              </div>
              <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                <span>Started: {formatTime(item.startTime)}</span>
                <span>Duration: {formatDuration(item.startTime, item.endTime)}</span>
                <span>Triggered by: {item.triggeredBy}</span>
                {lastUpdated && (
                  <span className="ml-auto">Last updated: {lastUpdated}</span>
                )}
                <button
                  onClick={fetchItem}
                  className="px-3 py-1.5 text-[10px] font-semibold rounded-none transition-colors"
                  style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)", border: "1px solid var(--color-border)" }}
                >
                  Refresh
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Terminal output */}
        {item && (
          <div
            className="flex-1 min-h-0 relative rounded-lg overflow-hidden"
            style={{ background: "var(--terminal-bg)", border: "1px solid var(--terminal-border)" }}
          >
            <div
              className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
              style={{
                background: "repeating-linear-gradient(0deg, transparent, transparent 2px, color-mix(in srgb, var(--color-primary) 8%, transparent) 2px, color-mix(in srgb, var(--color-primary) 8%, transparent) 4px)",
              }}
            />
            <pre
              className="absolute inset-0 p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap"
              style={{
                color: "var(--terminal-fg-alt)",
                scrollbarWidth: "thin",
                scrollbarColor: "var(--color-outline-variant) transparent",
              }}
            >
              {terminalText || (isRunning ? "Waiting for first flush…" : "No output recorded.")}
            </pre>
          </div>
        )}
      </div>
    </AppShell>
  );
}
