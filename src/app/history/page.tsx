"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { formatSeconds } from "@/lib/format";

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
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {status}
    </span>
  );
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
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
  const { showToast } = useToast();

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
          <h1 className="text-2xl font-bold text-[#E5E2E1] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            Command History
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHistory}
              className="px-4 py-2 text-xs font-semibold rounded-none transition-colors"
              style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              Refresh
            </button>
            {items.length > 0 && (
              <button
                onClick={() => setClearOpen(true)}
                className="px-4 py-2 text-xs font-semibold rounded-none transition-colors"
                style={{ background: "rgba(255, 180, 171, 0.1)", color: "#FFB4AB", border: "1px solid rgba(255, 180, 171, 0.3)" }}
              >
                Clear History
              </button>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#849587]">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#849587] gap-3">
            <span className="material-symbols-outlined text-4xl">history</span>
            <p>No command history yet.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#3B4B3F transparent" }}>
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/history/${item.id}`}
                className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg gap-3 transition-all duration-200 hover:scale-[1.005]"
                style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#E5E2E1] truncate">
                      {item.workerTimer?.name ?? item.macro?.name ?? "Unknown"}
                      {item.workerTimer && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none" style={{ background: "rgba(0, 255, 156, 0.1)", color: "#00FF9C" }}>
                          timer
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {statusPill(item.status)}
                      <span className="text-xs text-[#849587]">{item.triggeredBy}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-xs text-[#849587]">
                  <span>{formatTime(item.startTime)}</span>
                  <span>{formatDuration(item.startTime, item.endTime)}</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </div>
              </Link>
            ))}
          </div>
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
        <p className="text-sm text-[#849587]">
          Are you sure you want to delete all command history? This cannot be undone.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
