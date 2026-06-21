"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

interface SchedulesListProps {
  macros: MacroOption[];
  initialSchedules: ScheduleRow[];
}

export function SchedulesList({ macros, initialSchedules }: SchedulesListProps) {
  const toast = useToast();
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleRow[]>(initialSchedules);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = useCallback(
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
        toast.showToast("Schedule created", "success");
        router.refresh();
      } catch (err) {
        toast.showToast(
          err instanceof Error ? err.message : "Failed to create schedule",
          "error"
        );
      }
    },
    [toast, router]
  );

  const handleToggle = useCallback(
    async (id: number) => {
      // Optimistic update
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

  const handleDelete = useCallback(async () => {
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

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto stagger-1 p-4 md:p-6">
      <h1
        className="text-2xl font-bold text-on-surface tracking-tight"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        Scheduled Commands
      </h1>

      <div
        className="p-6 rounded-none"
        style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <h2
          className="text-lg font-bold text-on-surface mb-5"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          New Schedule
        </h2>
        <NewScheduleForm macros={macros} onCreate={handleCreate} />
      </div>

      <div
        className="p-6 rounded-none"
        style={{ background: "#1C1B1B", border: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <h2
          className="text-lg font-bold text-on-surface mb-4"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Schedules
        </h2>
        {schedules.length === 0 ? (
          <p className="text-on-surface-variant text-sm italic">No schedules found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                data-schedule-id={s.id}
                className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-none gap-3 transition-opacity"
                style={{
                  background: "#201F1F",
                  border: "1px solid rgba(59, 75, 63, 0.3)",
                  opacity: s.enabled ? 1 : 0.4,
                }}
              >
                <div className="flex items-center gap-3">
                  <ToggleSwitch
                    enabled={s.enabled}
                    onChange={() => {
                      if (togglingId !== s.id) void handleToggle(s.id);
                    }}
                    label={`Toggle schedule for ${s.macroName}`}
                  />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-on-surface">{s.macroName}</span>
                      {!s.enabled && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-none"
                          style={{
                            background: "rgba(107, 114, 128, 0.2)",
                            color: "#9CA3AF",
                          }}
                        >
                          Disabled
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono text-xs"
                      style={{ color: "#00FF9C" }}
                    >
                      {s.cronExpression}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Link href={`/schedules/${s.id}/edit`}>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
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
