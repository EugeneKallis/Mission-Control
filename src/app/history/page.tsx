"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { formatSeconds } from "@/lib/format";
import { HistoryTitleFilters } from "@/components/history/history-title-filters";

interface HistoryItem {
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

function historyTitle(item: HistoryItem): string {
  return item.workerTimer?.name ?? item.macro?.name ?? item.agentTask?.name ?? "Unknown";
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

function formatDuration(start: string, end: string | null): string {
  if (!end) return "\u2014";
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return formatSeconds(sec);
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

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [failedOnly, setFailedOnly] = useState(false);
  const { showToast } = useToast();

  const titleFilters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const title = historyTitle(item);
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  }, [items]);

  const filteredItems = useMemo(() => {
    const selected = new Set(selectedTitles);
    return items.filter((item) =>
      (!failedOnly || item.status === "failed") &&
      (selectedTitles.length === 0 || selected.has(historyTitle(item))),
    );
  }, [items, selectedTitles, failedOnly]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        setItems(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchHistory();
    }, 5000);

    const onVisibilityChange = () => {
      if (!document.hidden) fetchHistory();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchHistory]);

  const handleClear = useCallback(async () => {
    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      if (res.ok) {
        setItems([]);
        setSelectedTitles([]);
        showToast("History cleared", "success");
      } else {
        showToast("Failed to clear history", "error");
      }
    } catch {
      showToast("Failed to clear history", "error");
    }
    setClearOpen(false);
  }, [showToast]);

  return (
    <AppShell>
      <div className="flex flex-col h-full gap-5 stagger-1 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              Command History
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Recent macro and task executions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHistory}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refresh
            </button>
            {items.length > 0 && (
              <button
                onClick={() => setClearOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-error/10 text-error border border-error/30 hover:bg-error/20 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                Clear History
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">history</span>
            <p className="text-sm">No command history yet.</p>
            <p className="text-xs text-on-surface-variant/60">Run a macro to see its output here.</p>
          </div>
        ) : (
          <>
            <div className="shrink-0">
              <label className="inline-flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={failedOnly}
                  onChange={(event) => setFailedOnly(event.target.checked)}
                  className="accent-primary"
                />
                Show only failed jobs
              </label>
            </div>
            <HistoryTitleFilters
              filters={titleFilters}
              selectedTitles={selectedTitles}
              onSelectedTitlesChange={setSelectedTitles}
            />
            <p className="shrink-0 text-xs text-on-surface-variant" aria-live="polite">
              Showing {filteredItems.length} of {items.length} {items.length === 1 ? "run" : "runs"}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {filteredItems.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">
                  No history matches the selected filters.
                </div>
              ) : filteredItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/history/${item.id}`}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-[var(--radius-card)] gap-3 transition-all duration-200 hover:bg-surface-container border border-outline-variant/20 bg-surface-container-lowest/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-on-surface truncate">
                        {historyTitle(item)}
                        {item.workerTimer && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-primary/10 text-primary">
                            timer
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {statusPill(item.status)}
                        <span className="text-xs text-on-surface-variant">{item.triggeredBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-on-surface-variant">
                    <span>{formatTime(item.startTime)}</span>
                    <span className="font-mono">{formatDuration(item.startTime, item.endTime)}</span>
                    <span className="material-symbols-outlined text-sm text-on-surface-variant/50">chevron_right</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={handleClear}
        title="Clear History"
        icon="warning"
        confirmLabel="Clear All"
        variant="danger"
      >
        <p className="text-sm text-on-surface-variant">
          Are you sure you want to delete all command history? This cannot be undone.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
