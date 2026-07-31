"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import type { Macro, MacroCommand, MacroGroup, GroupWithMacros } from "@/types";
import { BrowseScripts } from "@/components/browse-scripts";
import { MacroLogPanel } from "@/components/macro-log-panel";

// ── Sortable Macro Row ───────────────────────────────────────────────────

function SortableMacroRow({
  macro,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onRun,
  commands,
  commandsLoading,
  onDeleteCommand,
  onReorderCommands,
  showAddForm,
  addCmdText,
  addCmdDir,
  onAddCmdTextChange,
  onAddCmdDirChange,
  onAddCmdSubmit,
  onAddCmdCancel,
  editingIndex,
  editCmdText,
  editCmdDir,
  onEditCmdTextChange,
  onEditCmdDirChange,
  onEditCmdSave,
  onEditCmdCancel,
  onEditCmdStart,
}: {
  macro: Macro;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
  commands: MacroCommand[];
  commandsLoading: boolean;
  onDeleteCommand: (index: number) => void;
  onReorderCommands: (order: number[]) => void;
  showAddForm: boolean;
  addCmdText: string;
  addCmdDir: string;
  onAddCmdTextChange: (v: string) => void;
  onAddCmdDirChange: (v: string) => void;
  onAddCmdSubmit: () => void;
  onAddCmdCancel: () => void;
  editingIndex: number | null;
  editCmdText: string;
  editCmdDir: string;
  onEditCmdTextChange: (v: string) => void;
  onEditCmdDirChange: (v: string) => void;
  onEditCmdSave: () => void;
  onEditCmdCancel: () => void;
  onEditCmdStart: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `macro-${macro.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex flex-col rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-low overflow-hidden">
        {/* Macro header row */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
          {/* Drag handle */}
          <button
            className="p-1.5 cursor-grab active:cursor-grabbing text-outline-variant hover:text-on-surface-variant transition-colors"
            {...attributes}
            {...listeners}
          >
            <span className="material-symbols-outlined text-sm">drag_indicator</span>
          </button>

          {/* Expand arrow */}
          <button
            onClick={onToggle}
            className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "" }}>
              chevron_right
            </span>
          </button>

          {/* Name */}
          <span className="min-w-0 flex-1 break-words text-sm font-medium text-on-surface sm:truncate" title={macro.name}>{macro.name}</span>

          {/* Description (desktop) */}
          {macro.description && (
            <span className="hidden md:block text-xs text-on-surface-variant max-w-[200px] truncate">{macro.description}</span>
          )}

          {/* Actions */}
          <div className="flex w-full shrink-0 justify-end gap-1 sm:w-auto sm:justify-start">
            <button
              onClick={onRun}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] border border-success/30 bg-success/10 text-success transition-all duration-200 hover:bg-success/20 active:scale-[0.98] sm:min-h-0"
              title="Run this macro"
            >
              <span className="material-symbols-outlined text-xs">play_arrow</span>
              Run
            </button>
            <button
              onClick={onEdit}
              className="min-h-11 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] text-on-surface-variant transition-colors hover:bg-surface-container-high active:scale-[0.98] sm:min-h-0"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="min-h-11 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] text-error transition-colors hover:bg-surface-container-high active:scale-[0.98] sm:min-h-0"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Expanded commands panel */}
        {expanded && (
          <div className="border-t border-outline-variant/15">
            {commandsLoading ? (
              <div className="px-4 py-3 text-xs text-on-surface-variant">Loading commands...</div>
            ) : commands.length === 0 && !showAddForm ? (
              <div className="px-4 py-3 text-xs text-on-surface-variant">No commands. Add one below.</div>
            ) : (
              <div className="p-2 space-y-1">
                <CommandsList
                  commands={commands}
                  macroId={macro.id}
                  onDelete={onDeleteCommand}
                  onReorder={onReorderCommands}
                  editingIndex={editingIndex}
                  editCmdText={editCmdText}
                  editCmdDir={editCmdDir}
                  onEditCmdTextChange={onEditCmdTextChange}
                  onEditCmdDirChange={onEditCmdDirChange}
                  onEditCmdSave={onEditCmdSave}
                  onEditCmdCancel={onEditCmdCancel}
                  onEditCmdStart={onEditCmdStart}
                />
              </div>
            )}

            {/* Inline add form */}
            {showAddForm && (
              <div className="px-3 py-2 space-y-2 border-t border-outline-variant/15">
                <div className="flex gap-1 items-start">
                  <textarea
                    className="min-h-20 flex-1 resize-y bg-bg border border-outline-variant/40 rounded px-2 py-1.5 text-base sm:text-xs font-mono text-on-surface outline-none focus:border-primary transition-colors"
                    placeholder="Command (e.g. scripts/my-script.sh)"
                    value={addCmdText}
                    onChange={(e) => onAddCmdTextChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAddCmdSubmit(); }}
                    rows={3}
                    autoFocus
                  />
                  <BrowseScripts onSelect={(cmd) => onAddCmdTextChange(cmd)} />
                </div>
                <input
                  className="w-full bg-bg border border-outline-variant/40 rounded px-2 py-1.5 text-base sm:text-xs font-mono text-on-surface outline-none focus:border-primary transition-colors"
                  placeholder="Working directory (optional)"
                  value={addCmdDir}
                  onChange={(e) => onAddCmdDirChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddCmdSubmit(); }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={onAddCmdSubmit}
                    className="px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-primary text-on-primary hover:bg-primary-dim active:scale-[0.98]"
                  >
                    Save
                  </button>
                  <button
                    onClick={onAddCmdCancel}
                    className="px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-colors hover:bg-surface-container-high text-on-surface-variant active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="px-3 pb-2">
              {!showAddForm && (
                <button
                  onClick={onAddCmdSubmit}
                  className="text-xs text-success hover:underline inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">add</span>
                  Add Command
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Commands List (sortable) ─────────────────────────────────────────────

function CommandsList({
  commands,
  macroId,
  onDelete,
  onReorder,
  editingIndex,
  editCmdText,
  editCmdDir,
  onEditCmdTextChange,
  onEditCmdDirChange,
  onEditCmdSave,
  onEditCmdCancel,
  onEditCmdStart,
}: {
  commands: MacroCommand[];
  macroId: number;
  onDelete: (index: number) => void;
  onReorder: (order: number[]) => void;
  editingIndex: number | null;
  editCmdText: string;
  editCmdDir: string;
  onEditCmdTextChange: (v: string) => void;
  onEditCmdDirChange: (v: string) => void;
  onEditCmdSave: () => void;
  onEditCmdCancel: () => void;
  onEditCmdStart: (index: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = commands.findIndex((_, i) => `cmd-${macroId}-${i}` === active.id);
    const newIndex = commands.findIndex((_, i) => `cmd-${macroId}-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(commands.map((_, i) => i), oldIndex, newIndex);
    onReorder(newOrder);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={commands.map((_, i) => `cmd-${macroId}-${i}`)}
        strategy={verticalListSortingStrategy}
      >
        {commands.map((cmd, i) => (
          <SortableCommandRow
            key={`cmd-${macroId}-${i}`}
            cmd={cmd}
            index={i}
            macroId={macroId}
            editing={editingIndex === i}
            editCmdText={editingIndex === i ? editCmdText : ""}
            editCmdDir={editingIndex === i ? editCmdDir : ""}
            onEditCmdTextChange={onEditCmdTextChange}
            onEditCmdDirChange={onEditCmdDirChange}
            onEditCmdSave={onEditCmdSave}
            onEditCmdCancel={onEditCmdCancel}
            onEditCmdStart={() => onEditCmdStart(i)}
            onDelete={() => onDelete(i)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableCommandRow({
  cmd,
  index,
  macroId,
  onDelete,
  editing,
  editCmdText,
  editCmdDir,
  onEditCmdTextChange,
  onEditCmdDirChange,
  onEditCmdSave,
  onEditCmdCancel,
  onEditCmdStart,
}: {
  cmd: MacroCommand;
  index: number;
  macroId: number;
  onDelete: () => void;
  editing: boolean;
  editCmdText: string;
  editCmdDir: string;
  onEditCmdTextChange: (v: string) => void;
  onEditCmdDirChange: (v: string) => void;
  onEditCmdSave: () => void;
  onEditCmdCancel: () => void;
  onEditCmdStart: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `cmd-${macroId}-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs bg-bg/50 border border-outline-variant/15"
    >
      <button
        className="p-1.5 cursor-grab active:cursor-grabbing text-outline-variant hover:text-on-surface-variant transition-colors"
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-xs">drag_indicator</span>
      </button>
      <span className="text-[10px] text-outline-variant font-mono w-4">#{index}</span>

      {editing ? (
        <div className="flex flex-col flex-1 gap-1">
          <div className="flex gap-1 items-start">
            <textarea
              className="min-h-20 flex-1 resize-y bg-bg border border-outline-variant/40 rounded px-1.5 py-0.5 text-base sm:text-[10px] font-mono text-on-surface outline-none focus:border-primary transition-colors"
              placeholder="Command"
              value={editCmdText}
              onChange={(e) => onEditCmdTextChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onEditCmdSave(); if (e.key === "Escape") onEditCmdCancel(); }}
              rows={3}
              autoFocus
            />
            <BrowseScripts onSelect={(cmd) => onEditCmdTextChange(cmd)} />
          </div>
          <input
            className="w-full bg-bg border border-outline-variant/40 rounded px-1.5 py-0.5 text-base sm:text-[10px] font-mono text-on-surface-variant outline-none focus:border-primary transition-colors"
            placeholder="Working directory"
            value={editCmdDir}
            onChange={(e) => onEditCmdDirChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onEditCmdSave(); if (e.key === "Escape") onEditCmdCancel(); }}
          />
          <div className="flex gap-1">
            <button onClick={onEditCmdSave} className="text-success text-[10px] hover:underline">Save</button>
            <button onClick={onEditCmdCancel} className="text-on-surface-variant text-[10px] hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-[10px] text-on-surface truncate">{cmd.cmd}</span>
          {cmd.working_dir && (
            <span className="text-[10px] text-on-surface-variant font-mono truncate max-w-[120px]">{cmd.working_dir}</span>
          )}
        </>
      )}

      <div className="flex gap-1 shrink-0">
        {!editing && (
          <button onClick={onEditCmdStart} className="p-1.5 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-xs">edit</span>
          </button>
        )}
        <button onClick={onDelete} className="p-1.5 text-error hover:text-red-400 transition-colors">
          <span className="material-symbols-outlined text-xs">close</span>
        </button>
      </div>
    </div>
  );
}

// ── Group card ───────────────────────────────────────────────────────────

function GroupCard({
  group,
  macros,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onReorderMacros,
  onEditMacro,
  onDeleteMacro,
  onAddMacro,
  onRunMacro,
}: {
  group: MacroGroup;
  macros: Macro[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReorderMacros: (macroIds: number[]) => void;
  onEditMacro: (macro: Macro) => void;
  onDeleteMacro: (id: number) => void;
  onAddMacro: () => void;
  onRunMacro: (macro: Macro) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = macros.findIndex((m) => `macro-${m.id}` === active.id);
    const newIndex = macros.findIndex((m) => `macro-${m.id}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(macros, oldIndex, newIndex);
    onReorderMacros(reordered.map((m) => m.id));
  };

  const [editName, setEditName] = useState(group.name);
  const [editing, setEditing] = useState(false);

  const handleSaveName = async () => {
    if (!editName.trim() || editName === group.name) {
      setEditing(false);
      return;
    }
    try {
      await fetch(`/api/macros/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      onEdit(); // signal parent to refresh
    } catch {}
    setEditing(false);
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: expanded ? "1px solid var(--color-border)" : "none" }}
      >
        {editing ? (
          <input
            className="min-w-0 flex-1 rounded border border-outline-variant/40 bg-bg px-2 py-0.5 text-base sm:text-sm text-on-surface outline-none transition-colors focus:border-primary"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${group.name}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="material-symbols-outlined shrink-0 text-sm text-on-surface-variant transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "" }} aria-hidden="true">
              chevron_right
            </span>
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-on-surface">{group.name}</span>
            <span className="shrink-0 text-xs text-on-surface-variant">({macros.length})</span>
          </button>
        )}
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => { setEditing(true); setEditName(group.name); }}
            className="min-h-11 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] text-on-surface-variant transition-colors hover:bg-surface-container-high sm:min-h-0"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="min-h-11 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] text-error transition-colors hover:bg-surface-container-high sm:min-h-0"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Macros */}
      {expanded && (
        <div className="p-3 space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={macros.map((m) => `macro-${m.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {macros.length === 0 ? (
                <div className="text-xs text-on-surface-variant py-2 text-center">No macros in this group.</div>
              ) : (
                macros.map((macro) => (
                  <MacroRowContainer
                    key={macro.id}
                    macro={macro}
                    onEdit={() => onEditMacro(macro)}
                    onDelete={() => onDeleteMacro(macro.id)}
                    onRun={() => onRunMacro(macro)}
                  />
                ))
              )}
            </SortableContext>
          </DndContext>
          <button
            onClick={onAddMacro}
            className="text-xs text-success hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-xs">add</span>
            New Macro
          </button>
        </div>
      )}
    </div>
  );
}

// ── Macro Row Container (manages expansion per macro) ────────────────────

function MacroRowContainer({
  macro,
  onEdit,
  onDelete,
  onRun,
}: {
  macro: Macro;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commands, setCommands] = useState<MacroCommand[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const fetchedForExpansionRef = useRef(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCmdText, setAddCmdText] = useState("");
  const [addCmdDir, setAddCmdDir] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editCmdText, setEditCmdText] = useState("");
  const [editCmdDir, setEditCmdDir] = useState("");

  useEffect(() => {
    if (!expanded) {
      fetchedForExpansionRef.current = false;
      return;
    }
    if (fetchedForExpansionRef.current) return;
    fetchedForExpansionRef.current = true;

    setCommandsLoading(true);
    fetch(`/api/macros/${macro.id}/commands`)
      .then((r) => r.json())
      .then((data) => {
        setCommands(data);
      })
      .catch(() => {
        fetchedForExpansionRef.current = false;
        setCommands([]);
      })
      .finally(() => setCommandsLoading(false));
  }, [expanded, macro.id]);

  const handleShowAddForm = () => {
    setAddCmdText("");
    setAddCmdDir("");
    setShowAddForm(true);
  };

  const handleAddCmdSubmit = async () => {
    if (!showAddForm) {
      handleShowAddForm();
      return;
    }
    if (!addCmdText.trim()) return;
    try {
      const res = await fetch(`/api/macros/${macro.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ord: commands.length, cmd: addCmdText.trim(), working_dir: addCmdDir || undefined }),
      });
      if (res.ok) {
        const added = await res.json();
        setCommands((prev) => [...prev, added]);
        setShowAddForm(false);
        setAddCmdText("");
        setAddCmdDir("");
      }
    } catch {}
  };

  const handleAddCmdCancel = () => {
    setShowAddForm(false);
    setAddCmdText("");
    setAddCmdDir("");
  };

  const handleEditCmdStart = (index: number) => {
    setEditingIndex(index);
    setEditCmdText(commands[index]?.cmd || "");
    setEditCmdDir(commands[index]?.working_dir || "");
  };

  const handleEditCmdSave = async () => {
    if (editingIndex === null) return;
    if (!editCmdText.trim()) return;
    try {
      const res = await fetch(`/api/macros/${macro.id}/commands`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: editingIndex, cmd: editCmdText.trim(), working_dir: editCmdDir || undefined }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCommands((prev) => prev.map((c, i) => (i === editingIndex ? { ...c, ...updated } : c)));
        setEditingIndex(null);
      }
    } catch {}
  };

  const handleEditCmdCancel = () => {
    setEditingIndex(null);
  };

  const handleDeleteCommandLocal = async (index: number) => {
    try {
      await fetch(`/api/macros/${macro.id}/commands?index=${index}`, { method: "DELETE" });
      setCommands((prev) => prev.filter((_, i) => i !== index));
    } catch {}
  };

  const handleReorderCommandsLocal = async (order: number[]) => {
    try {
      await fetch(`/api/macros/${macro.id}/commands/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      setCommands((prev) => order.map((i) => ({ ...prev[i], ord: 0 })).map((c, i) => ({ ...c, ord: i })));
    } catch {}
  };

  return (
    <SortableMacroRow
      macro={macro}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      onEdit={onEdit}
      onDelete={onDelete}
      onRun={onRun}
      commands={commands}
      commandsLoading={commandsLoading}
      onDeleteCommand={handleDeleteCommandLocal}
      onReorderCommands={handleReorderCommandsLocal}
      showAddForm={showAddForm}
      addCmdText={addCmdText}
      addCmdDir={addCmdDir}
      onAddCmdTextChange={setAddCmdText}
      onAddCmdDirChange={setAddCmdDir}
      onAddCmdSubmit={handleAddCmdSubmit}
      onAddCmdCancel={handleAddCmdCancel}
      editingIndex={editingIndex}
      editCmdText={editCmdText}
      editCmdDir={editCmdDir}
      onEditCmdTextChange={setEditCmdText}
      onEditCmdDirChange={setEditCmdDir}
      onEditCmdSave={handleEditCmdSave}
      onEditCmdCancel={handleEditCmdCancel}
      onEditCmdStart={handleEditCmdStart}
    />
  );
}

// ── Main Admin Page ──────────────────────────────────────────────────────

export default function AdminPage() {
  const [groupedMacros, setGroupedMacros] = useState<GroupWithMacros[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(new Set());
  const groupsInitializedRef = useRef(false);
  const allExpanded = groupedMacros.every((g) => expandedGroupIds.has(g.group?.id ?? 0));
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewMacroModal, setShowNewMacroModal] = useState(false);
  const [editMacroTarget, setEditMacroTarget] = useState<Macro | null>(null);
  const [deleteMacroTarget, setDeleteMacroTarget] = useState<Macro | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<MacroGroup | null>(null);
  const { showToast } = useToast();

  const [newMacroName, setNewMacroName] = useState("");
  const [newMacroGroup, setNewMacroGroup] = useState("");
  const [newMacroDesc, setNewMacroDesc] = useState("");
  const [newMacroCmd, setNewMacroCmd] = useState("");

  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [runningMacroId, setRunningMacroId] = useState<number | null>(null);
  const [runningMacroName, setRunningMacroName] = useState("");

  const fetchMacros = useCallback(async () => {
    try {
      const res = await fetch("/api/macros");
      if (res.ok) {
        const data = await res.json();
        setGroupedMacros(data);
        if (!groupsInitializedRef.current) {
          setExpandedGroupIds(new Set(data.map((g: GroupWithMacros) => g.group?.id ?? 0)));
          groupsInitializedRef.current = true;
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacros();
  }, [fetchMacros]);

  // ── Group CRUD ────────────────────────────────────────────────────────

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch("/api/macros/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (res.ok) {
        const group: MacroGroup = await res.json();
        if (allExpanded) {
          setExpandedGroupIds((previous) => new Set(previous).add(group.id));
        }
        showToast("Group created", "success");
        setShowNewGroupModal(false);
        setNewGroupName("");
        fetchMacros();
      }
    } catch {
      showToast("Failed to create group", "error");
    }
  }, [newGroupName, allExpanded, showToast, fetchMacros]);

  const handleDeleteGroup = useCallback(async () => {
    if (!deleteGroupTarget) return;
    try {
      const res = await fetch(`/api/macros/groups/${deleteGroupTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Group deleted", "success");
        setDeleteGroupTarget(null);
        fetchMacros();
      }
    } catch {
      showToast("Failed to delete group", "error");
    }
  }, [deleteGroupTarget, showToast, fetchMacros]);

  // ── Macro CRUD ────────────────────────────────────────────────────────

  const handleCreateMacro = useCallback(async () => {
    if (!newMacroName.trim()) return;
    try {
      const res = await fetch("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMacroName.trim(),
          description: newMacroDesc,
          groupName: newMacroGroup || "Ungrouped",
          commands: newMacroCmd ? JSON.stringify([{ ord: 0, cmd: newMacroCmd }]) : "[]",
        }),
      });
      if (res.ok) {
        showToast("Macro created", "success");
        setShowNewMacroModal(false);
        resetNewMacroForm();
        fetchMacros();
      }
    } catch {
      showToast("Failed to create macro", "error");
    }
  }, [newMacroName, newMacroDesc, newMacroGroup, newMacroCmd, showToast, fetchMacros]);

  const resetNewMacroForm = () => {
    setNewMacroName("");
    setNewMacroDesc("");
    setNewMacroGroup("");
    setNewMacroCmd("");
  };

  const handleEditMacro = useCallback(async () => {
    if (!editMacroTarget || !editMacroTarget.name.trim()) return;
    try {
      const res = await fetch(`/api/macros/${editMacroTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editMacroTarget.name,
          description: editMacroTarget.description,
          groupName: editMacroTarget.groupName,
        }),
      });
      if (res.ok) {
        showToast("Macro updated", "success");
        setEditMacroTarget(null);
        fetchMacros();
      }
    } catch {
      showToast("Failed to update macro", "error");
    }
  }, [editMacroTarget, showToast, fetchMacros]);

  const handleDeleteMacro = useCallback(async () => {
    if (!deleteMacroTarget) return;
    try {
      const res = await fetch(`/api/macros/${deleteMacroTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Macro deleted", "success");
        setDeleteMacroTarget(null);
        fetchMacros();
      }
    } catch {
      showToast("Failed to delete macro", "error");
    }
  }, [deleteMacroTarget, showToast, fetchMacros]);

  const handleRunMacro = useCallback(
    (macro: Macro) => {
      fetch(`/api/run/${macro.id}`, { method: "POST" })
        .then((r) => {
          if (r.ok) {
            showToast(`Running: ${macro.name}`, "info");
            setRunningMacroId(macro.id);
            setRunningMacroName(macro.name);
            setLogPanelOpen(true);
          } else {
            showToast("Failed to start macro", "error");
          }
        })
        .catch(() => {
          showToast("Failed to start macro", "error");
        });
    },
    [showToast],
  );

  const handleReorderMacros = useCallback(async (macroIds: number[]) => {
    const macro = groupedMacros
      .flatMap((g) => g.macros)
      .find((m) => m.id === macroIds[0]);
    const groupName = macro?.groupName || "Ungrouped";
    const group = groupedMacros.find((g) => g.group?.name === groupName)?.group;

    try {
      await fetch("/api/macros/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group?.id,
          macroIds,
        }),
      });
      fetchMacros();
    } catch {}
  }, [groupedMacros, fetchMacros]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 md:p-6 min-h-full flex flex-col stagger-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">
              Admin
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Manage macro groups and commands
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            <button
              onClick={() => setExpandedGroupIds(allExpanded ? new Set() : new Set(groupedMacros.map((g) => g.group?.id ?? 0)))}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] bg-surface-container text-on-surface transition-all duration-200 hover:bg-surface-container-high active:scale-[0.98] sm:min-h-0 sm:w-auto"
            >
              <span className="material-symbols-outlined text-sm">{allExpanded ? "unfold_less" : "unfold_more"}</span>
              {allExpanded ? "Compress All" : "Expand All"}
            </button>
            <Button className="min-h-11 flex-1 sm:min-h-0 sm:flex-none" onClick={() => { setNewGroupName(""); setShowNewGroupModal(true); }}>
              New Group
            </Button>
            <Button className="min-h-11 flex-1 sm:min-h-0 sm:flex-none" onClick={() => { resetNewMacroForm(); setShowNewMacroModal(true); }}>
              New Macro
            </Button>
          </div>
        </div>

        {/* Groups list */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant">Loading...</div>
        ) : groupedMacros.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">settings</span>
            <p className="text-sm">No macros or groups yet.</p>
            <p className="text-xs text-on-surface-variant/60">Create a group and add macros to get started.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              {groupedMacros.map((g) => (
                <GroupCard
                  key={g.group?.id || "ungrouped"}
                  group={g.group || { id: 0, name: "Ungrouped", ord: 999 }}
                  macros={g.macros}
                  expanded={expandedGroupIds.has(g.group?.id ?? 0)}
                  onToggle={() => setExpandedGroupIds((previous) => {
                    const groupId = g.group?.id ?? 0;
                    const next = new Set(previous);
                    if (next.has(groupId)) {
                      next.delete(groupId);
                    } else {
                      next.add(groupId);
                    }
                    return next;
                  })}
                  onEdit={fetchMacros}
                  onDelete={() => g.group && setDeleteGroupTarget(g.group)}
                  onReorderMacros={handleReorderMacros}
                  onEditMacro={(macro) => setEditMacroTarget({ ...macro })}
                  onDeleteMacro={(id) => setDeleteMacroTarget(groupedMacros.flatMap((x) => x.macros).find((m) => m.id === id) || null)}
                  onAddMacro={() => { resetNewMacroForm(); setShowNewMacroModal(true); }}
                  onRunMacro={handleRunMacro}
                />
              ))}
            </div>

            {logPanelOpen && (
              <div className="mt-4">
                <MacroLogPanel
                  runningMacroId={runningMacroId}
                  runningMacroName={runningMacroName}
                  onClose={() => {
                    setLogPanelOpen(false);
                    setRunningMacroId(null);
                  }}
                />
              </div>
            )}
            {!logPanelOpen && (
              <button
                onClick={() => setLogPanelOpen(true)}
                className="mt-2 self-start px-3 py-1.5 text-xs text-success hover:underline inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">terminal</span>
                Show log panel
              </button>
            )}
          </>
        )}
      </div>

      {/* ── New Group Modal ────────────────────────────────────────────── */}
      <Modal open={showNewGroupModal} onClose={() => setShowNewGroupModal(false)} title="New Group">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Group Name</label>
            <input
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowNewGroupModal(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* ── New Macro Modal ────────────────────────────────────────────── */}
      <Modal open={showNewMacroModal} onClose={() => setShowNewMacroModal(false)} title="New Macro">
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Name *</label>
            <input
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={newMacroName}
              onChange={(e) => setNewMacroName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Group</label>
            <select
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={newMacroGroup}
              onChange={(e) => setNewMacroGroup(e.target.value)}
            >
              <option value="">Ungrouped</option>
              {groupedMacros.map((g) => g.group && (
                <option key={g.group.id} value={g.group.name}>{g.group.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Description</label>
            <input
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={newMacroDesc}
              onChange={(e) => setNewMacroDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Initial Command</label>
            <div className="flex gap-1 items-start">
              <textarea
                className="min-h-24 flex-1 resize-y bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm font-mono text-on-surface outline-none focus:border-primary transition-colors"
                value={newMacroCmd}
                onChange={(e) => setNewMacroCmd(e.target.value)}
                placeholder="e.g. scripts/my-script.sh"
                rows={3}
              />
              <BrowseScripts onSelect={(cmd) => setNewMacroCmd(cmd)} size="sm" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowNewMacroModal(false)}>Cancel</Button>
            <Button onClick={handleCreateMacro}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Macro Modal ───────────────────────────────────────────── */}
      <Modal open={!!editMacroTarget} onClose={() => setEditMacroTarget(null)} title="Edit Macro">
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Name *</label>
            <input
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={editMacroTarget?.name || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, name: e.target.value } : null)}
            />
          </div>

          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Description</label>
            <input
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={editMacroTarget?.description || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, description: e.target.value } : null)}
            />
          </div>

          <div>
            <label className="block text-xs text-on-surface-variant mb-1">Group</label>
            <select
              className="w-full bg-bg border border-outline-variant/40 rounded px-3 py-2 text-base sm:text-sm text-on-surface outline-none focus:border-primary transition-colors"
              value={editMacroTarget?.groupName || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, groupName: e.target.value } : null)}
            >
              {groupedMacros.map((g) => g.group && (
                <option key={g.group.id} value={g.group.name}>{g.group.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditMacroTarget(null)}>Cancel</Button>
            <Button onClick={handleEditMacro}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmations ───────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteMacroTarget}
        onClose={() => setDeleteMacroTarget(null)}
        onConfirm={handleDeleteMacro}
        title="Delete Macro"
        confirmLabel="Delete"
        variant="danger"
      >
        <p className="text-sm text-on-surface-variant">
          Are you sure you want to delete <strong className="text-on-surface">{deleteMacroTarget?.name}</strong>?
          This cannot be undone.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteGroupTarget}
        onClose={() => setDeleteGroupTarget(null)}
        onConfirm={handleDeleteGroup}
        title="Delete Group"
        confirmLabel="Delete"
        variant="danger"
      >
        <p className="text-sm text-on-surface-variant">
          Are you sure you want to delete this group? Its macros will remain as ungrouped.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
