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

function statusBadgeColor(status: string | null): string {
  switch (status) {
    case "success": return "#618B6B";
    case "error": return "#FFB4AB";
    case "running": return "#FFD04C";
    default: return "#849587";
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
          className="text-2xl font-bold text-[#E5E2E1] tracking-tight"
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
          <div className="text-center text-sm text-[#849587] mt-8">
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
          title="Delete Task"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
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
      style={{ background: "#131313", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      {/* Row */}
      <div className="flex items-center justify-between p-3 gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ToggleSwitch
            checked={task.enabled}
            onChange={onToggle}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#E5E2E1] truncate">
                {task.name}
              </span>
              {task.lastStatus && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: `${statusBadgeColor(task.lastStatus)}20`,
                    color: statusBadgeColor(task.lastStatus),
                  }}
                >
                  {task.lastStatus}
                </span>
              )}
            </div>
            <div className="text-xs text-[#849587] mt-0.5 flex flex-wrap gap-x-3">
              <span>{formatCronHuman(task.cronExpression)}</span>
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
              background: "#201F1F",
              color: "#FFD04C",
              border: "1px solid rgba(255, 208, 76, 0.2)",
            }}
            title="Run now"
          >
            {isRunning ? "…" : "▶"}
          </button>
          <button
            onClick={() => setShowRuns(!showRuns)}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "#201F1F",
              color: "#849587",
              border: "1px solid rgba(59, 75, 63, 0.3)",
            }}
            title="View runs"
          >
            📋
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "#201F1F",
              color: "#618B6B",
              border: "1px solid rgba(97, 139, 107, 0.25)",
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 text-xs font-semibold rounded transition-colors"
            style={{
              background: "#201F1F",
              color: "#FFB4AB",
              border: "1px solid rgba(255, 180, 171, 0.25)",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Runs panel (collapsible) */}
      {showRuns && (
        <div style={{ borderTop: "1px solid rgba(59, 75, 63, 0.3)" }}>
          <AgentTaskRuns taskId={task.id} />
        </div>
      )}
    </div>
  );
}
