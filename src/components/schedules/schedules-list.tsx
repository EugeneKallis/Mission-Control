"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Button } from "@/components/ui/button";
import { NewScheduleForm } from "./new-schedule-form";

export interface MacroOption {
  id: number;
  name: string;
  groupName: string;
}

export interface ScheduleRow {
  id: number;
  macroId: number;
  macroName: string;
  cronExpression: string;
  enabled: boolean;
  createdAt: string | null;
}

export interface WorkerTimerRow {
  id: number;
  name: string;
  workerPath: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string | null;
}

interface SchedulesListProps {
  macros: MacroOption[];
  initialSchedules: ScheduleRow[];
  initialTimers: WorkerTimerRow[];
}

function formatCronHuman(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [min, hour, , , dow] = parts;

  if (min.startsWith("*/") && hour === "*") {
    return `Every ${min.slice(2)} minutes`;
  }
  if (min === "0" && hour.startsWith("*/")) {
    return `Every ${hour.slice(2)} hours`;
  }
  if (dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[parseInt(dow)] ?? dow;
  return `${dayName} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
}

export function SchedulesList({ macros, initialSchedules, initialTimers }: SchedulesListProps) {
  const toast = useToast();

  // ── Schedules state ──────────────────────────────────────────────
  const [schedules, setSchedules] = useState<ScheduleRow[]>(initialSchedules);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // ── Worker Timers state ──────────────────────────────────────────
  const [timers, setTimers] = useState<WorkerTimerRow[]>(initialTimers);
  const [timerTogglingId, setTimerTogglingId] = useState<number | null>(null);

  // ── Schedule handlers ────────────────────────────────────────────
  const handleCreateSchedule = useCallback(
    async (params: { macroId: number; cronExpression: string }) => {
      try {
        const res = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const newSchedule = await res.json();
        const macroName = macros.find((m) => m.id === params.macroId)?.name ?? "Unknown";
        setSchedules((prev) => [{
          ...newSchedule,
          macroName,
          createdAt: newSchedule.createdAt ?? new Date().toISOString(),
        }, ...prev]);
        toast.showToast("Schedule created", "success");
        setFormOpen(false);
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : "Failed to create schedule",
          "error"
        );
      }
    },
    [toast, macros]
  );

  const handleToggleSchedule = useCallback(
    async (id: number) => {
      const prev = schedules;
      setSchedules((rows) =>
        rows.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
      );
      setTogglingId(id);
      try {
        const res = await fetch(`/api/schedules/${id}/toggle`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.showToast("Schedule toggled", "success");
      } catch (err) {
        setSchedules(prev);
        toast.showToast(
          err instanceof Error ? err.message : "Failed to toggle schedule",
          "error"
        );
      } finally {
        setTogglingId(null);
      }
    },
    [schedules, toast]
  );

  const handleDeleteSchedule = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/schedules/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSchedules((rows) => rows.filter((r) => r.id !== deleteTarget.id));
      toast.showToast("Schedule deleted", "success");
      setDeleteTarget(null);
    } catch (err) {
      toast.showToast("Failed to delete schedule", "error");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, toast]);

  // ── Worker Timer handlers ────────────────────────────────────────
  const handleToggleTimer = useCallback(
    async (id: number) => {
      const prev = timers;
      setTimers((rows) =>
        rows.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
      );
      setTimerTogglingId(id);
      try {
        const res = await fetch(`/api/schedules/timers/${id}/toggle`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.showToast("Timer toggled", "success");
      } catch (err) {
        setTimers(prev);
        toast.showToast(
          err instanceof Error ? err.message : "Failed to toggle timer",
          "error"
        );
      } finally {
        setTimerTogglingId(null);
      }
    },
    [timers, toast]
  );

  const enabledScheduleCount = schedules.filter((s) => s.enabled).length;
  const enabledTimerCount = timers.filter((t) => t.enabled).length;

  return (
    <div className="flex flex-col gap-6 stagger-1 p-4 md:p-6 w-full">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h1
          className="text-2xl font-bold text-on-surface tracking-tight"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Schedules
        </h1>
        <p className="text-xs text-on-surface-variant mt-1">
          {schedules.length + timers.length === 0
            ? "No schedules configured"
            : `${schedules.length} macro ${schedules.length === 1 ? "schedule" : "schedules"} · ${timers.length} worker ${timers.length === 1 ? "timer" : "timers"} · ${enabledScheduleCount + enabledTimerCount} enabled`}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1: Macro Schedules
          ═══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">bolt</span>
            <h2
              className="text-lg font-semibold text-on-surface"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Macro Schedules
            </h2>
          </div>
          {!formOpen && (
            <Button variant="primary" onClick={() => setFormOpen(true)} disabled={macros.length === 0}>
              <span className="material-symbols-outlined text-sm">add</span>
              Add Schedule
            </Button>
          )}
        </div>

        {/* New schedule form */}
        {formOpen && (
          <div
            className="p-6 rounded-none mb-4"
            style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-base font-bold text-on-surface"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
              >
                New Macro Schedule
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                aria-label="Close form"
                className="text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            {macros.length === 0 ? (
              <p className="text-sm text-on-surface-variant italic">
                No macros available. Create a macro first in the Admin page.
              </p>
            ) : (
              <NewScheduleForm
                macros={macros}
                onCreate={handleCreateSchedule}
                onCancel={() => setFormOpen(false)}
              />
            )}
          </div>
        )}

        {/* Schedules list */}
        <div
          className="rounded-none"
          style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          {schedules.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                schedule
              </span>
              <p className="text-on-surface-variant text-sm">
                No macro schedules configured.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(59, 75, 63, 0.15)" }}>
              {schedules.map((s) => (
                <div
                  key={s.id}
                  data-schedule-id={s.id}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-3 transition-opacity"
                  style={{ opacity: s.enabled ? 1 : 0.5 }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ToggleSwitch
                      enabled={s.enabled}
                      onChange={() => {
                        if (togglingId !== s.id) void handleToggleSchedule(s.id);
                      }}
                      label={`Toggle schedule for ${s.macroName}`}
                    />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface truncate">
                          {s.macroName}
                        </span>
                        {!s.enabled && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none"
                            style={{ background: "rgba(107, 114, 128, 0.2)", color: "#9CA3AF" }}
                          >
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <code
                          className="font-mono text-xs px-2 py-0.5 rounded-none"
                          style={{ background: "#0E0E0E", color: "#00FF9C", border: "1px solid rgba(59, 75, 63, 0.3)" }}
                        >
                          {s.cronExpression}
                        </code>
                        <span className="text-[10px] text-on-surface-variant/60">
                          {formatCronHuman(s.cronExpression)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Link href={`/schedules/${s.id}/edit`} className="inline-flex">
                      <Button variant="ghost">
                        <span className="material-symbols-outlined text-sm">edit</span>
                        Edit
                      </Button>
                    </Link>
                    <Button variant="danger" onClick={() => setDeleteTarget(s)}>
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2: Worker Timers (pre-existing, no delete)
          ═══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-on-surface-variant text-lg">timer</span>
          <h2
            className="text-lg font-semibold text-on-surface"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Worker Timers
          </h2>
        </div>

        <div
          className="rounded-none"
          style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          {timers.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                timer
              </span>
              <p className="text-on-surface-variant text-sm">
                No worker timers configured.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(59, 75, 63, 0.15)" }}>
              {timers.map((t) => (
                <div
                  key={t.id}
                  data-timer-id={t.id}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-3 transition-opacity"
                  style={{ opacity: t.enabled ? 1 : 0.5 }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ToggleSwitch
                      enabled={t.enabled}
                      onChange={() => {
                        if (timerTogglingId !== t.id) void handleToggleTimer(t.id);
                      }}
                      label={`Toggle timer ${t.name}`}
                    />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface truncate">
                          {t.name}
                        </span>
                        {!t.enabled && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none"
                            style={{ background: "rgba(107, 114, 128, 0.2)", color: "#9CA3AF" }}
                          >
                            Disabled
                          </span>
                        )}
                        {t.lastStatus && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none"
                            style={{
                              background: t.lastStatus === "success" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                              color: t.lastStatus === "success" ? "#22C55E" : "#EF4444",
                            }}
                          >
                            {t.lastStatus}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <code
                          className="font-mono text-xs px-2 py-0.5 rounded-none"
                          style={{ background: "#0E0E0E", color: "#00FF9C", border: "1px solid rgba(59, 75, 63, 0.3)" }}
                        >
                          {t.cronExpression}
                        </code>
                        <span className="text-[10px] text-on-surface-variant/60">
                          {formatCronHuman(t.cronExpression)}
                        </span>
                        <code
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded-none text-on-surface-variant/60"
                          style={{ background: "#0E0E0E", border: "1px solid rgba(59, 75, 63, 0.2)" }}
                        >
                          {t.workerPath.split("/").pop()}
                        </code>
                      </div>
                      {t.lastRunAt && (
                        <span className="text-[10px] text-on-surface-variant/60">
                          Last run: {new Date(t.lastRunAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Link href={`/schedules/timers/${t.id}/edit`} className="inline-flex">
                      <Button variant="ghost">
                        <span className="material-symbols-outlined text-sm">edit</span>
                        Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Delete schedule confirmation ──────────────────────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSchedule}
        title="Delete schedule?"
        icon="delete"
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
      >
        <p className="text-sm text-on-surface-variant">
          This will remove the schedule for{" "}
          <span className="font-semibold text-on-surface">{deleteTarget?.macroName}</span> (
          <span className="font-mono">{deleteTarget?.cronExpression}</span>) and unregister it
          from the cron scheduler. This action cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
