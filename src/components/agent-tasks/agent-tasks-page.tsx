"use client";

import { useCallback, useState, useEffect } from "react";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Button } from "@/components/ui/button";
import { AgentTaskForm } from "./agent-task-form";
import { AgentTaskRuns } from "./agent-task-runs";
import type { AgentTaskRow, ResourceState } from "./agent-task-types";

interface Props {
  initialTasks: AgentTaskRow[];
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

function statusBadgeColors(status: string | null): { foreground: string; background: string } {
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

export function AgentTasksPage({ initialTasks }: Props) {
  const toast = useToast();

  // ── State ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<AgentTaskRow[]>(initialTasks);
  const [resources, setResources] = useState<ResourceState | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AgentTaskRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentTaskRow | null>(null);
  const [runningNow, setRunningNow] = useState<Set<number>>(new Set());

  // ── Fetch resources for the form ───────────────────────────────────
  useEffect(() => {
    fetch("/api/agent-tasks/resources")
      .then((r) => r.json())
      .then(setResources)
      .catch(() => {});
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────
  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-tasks");
      const data = await res.json() as { tasks: AgentTaskRow[] };
      setTasks(data.tasks);
    } catch {
      // ignore
    }
  }, []);

  // ── Toggle enabled ─────────────────────────────────────────────────
  const handleToggle = useCallback(async (id: number, enabled: boolean) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled } : t)),
    );

    try {
      const res = await fetch(`/api/agent-tasks/${id}/toggle`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshTasks();
    } catch {
      toast.showToast("Failed to toggle task", "error");
      await refreshTasks();
    }
  }, [toast, refreshTasks]);

  // ── Run now ────────────────────────────────────────────────────────
  const handleRunNow = useCallback(async (id: number) => {
    setRunningNow((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/agent-tasks/${id}/run`, { method: "POST" });
      if (res.ok) {
        toast.showToast("Task dispatched", "success");
        // Poll for status update after a small delay
        setTimeout(refreshTasks, 2000);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      toast.showToast("Failed to dispatch task", "error");
    } finally {
      setRunningNow((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [toast, refreshTasks]);

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/agent-tasks/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTasks((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.showToast("Task deleted", "success");
    } catch {
      toast.showToast("Failed to delete task", "error");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, toast]);

  // ── Create/Update submit ───────────────────────────────────────────
  const handleFormSubmit = useCallback(
    async (data: Partial<AgentTaskRow> & { cronExpression: string; prompt: string; name: string }) => {
      try {
        if (editingTask) {
          const res = await fetch(`/api/agent-tasks/${editingTask.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          toast.showToast("Task updated", "success");
        } else {
          const res = await fetch("/api/agent-tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          toast.showToast("Task created", "success");
        }
        setEditingTask(null);
        setFormOpen(false);
        await refreshTasks();
      } catch {
        toast.showToast("Failed to save task", "error");
      }
    },
    [editingTask, toast, refreshTasks],
  );

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h1
          className="text-2xl font-bold text-on-surface tracking-tight"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Scheduled Agent Tasks
        </h1>
        <Button onClick={() => { setEditingTask(null); setFormOpen(true); }}>
          + New Task
        </Button>
      </div>

      {/* Form (create / edit) */}
      {(formOpen || editingTask) && (
        <AgentTaskForm
          resources={resources}
          initial={editingTask}
          onSubmit={handleFormSubmit}
          onCancel={() => { setEditingTask(null); setFormOpen(false); }}
        />
      )}

      {/* Task list */}
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto">
        {tasks.length === 0 && !formOpen && (
          <div className="text-center text-sm text-on-surface-variant mt-8">
            No scheduled tasks yet. Create one to get started.
          </div>
        )}

        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={(enabled: boolean) => handleToggle(task.id, enabled)}
            onEdit={() => { setEditingTask(task); setFormOpen(true); }}
            onDelete={() => setDeleteTarget(task)}
            onRunNow={() => handleRunNow(task.id)}
            isRunning={runningNow.has(task.id)}
          />
        ))}
      </div>

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          title="Delete Task"
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        >
          {`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
        </ConfirmDialog>
      )}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: AgentTaskRow;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onRunNow: () => void;
  isRunning: boolean;
}

function TaskCard({ task, onToggle, onEdit, onDelete, onRunNow, isRunning }: TaskCardProps) {
  const [showRuns, setShowRuns] = useState(false);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Row */}
      <div className="flex items-center justify-between p-3 gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ToggleSwitch
            enabled={task.enabled}
            onChange={() => onToggle(!task.enabled)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-on-surface truncate">
                {task.name}
              </span>
              {task.lastStatus && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: statusBadgeColors(task.lastStatus).background,
                    color: statusBadgeColors(task.lastStatus).foreground,
                  }}
                >
                  {task.lastStatus}
                </span>
              )}
            </div>
            <div className="text-xs text-on-surface-variant mt-0.5 flex flex-wrap gap-x-3">
              <span>{formatCronHuman(task.cronExpression)} · {task.concurrencyPolicy}</span>
              {task.lastRunAt && (
                <span>Last: {new Date(task.lastRunAt).toLocaleString()}</span>
              )}
              {task.model && (
                <span>{task.provider ?? ""}/{task.model}</span>
              )}
              {task.enabledTools && JSON.parse(task.enabledTools).length > 0 && (
                <span>Tools: {(JSON.parse(task.enabledTools) as string[]).join(", ")}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRunNow}
            disabled={isRunning}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-40"
            style={{
              background: "var(--color-surface-container)",
              color: "var(--status-running-fg)",
              border: "1px solid var(--status-running-border)",
            }}
            title="Run now"
          >
            {isRunning ? "…" : "▶"}
          </button>
          <button
            onClick={() => setShowRuns(!showRuns)}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "var(--color-surface-container)",
              color: "var(--color-on-surface-variant)",
              border: "1px solid var(--color-border)",
            }}
            title="View runs"
          >
            📋
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "var(--color-surface-container)",
              color: "var(--status-success-fg)",
              border: "1px solid var(--status-success-border)",
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "var(--color-surface-container)",
              color: "var(--status-failed-fg)",
              border: "1px solid var(--status-failed-border)",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Runs panel (collapsible) */}
      {showRuns && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          <AgentTaskRuns taskId={task.id} />
        </div>
      )}
    </div>
  );
}
