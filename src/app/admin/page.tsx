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

// ── Command shortcuts ────────────────────────────────────────────────────

const COMMAND_SHORTCUTS = [
  "/opt/mission-control/bin/",
  "scripts/",
  "bin/",
  "/root/ServerTool/scripts/",
];

// ── Sortable Macro Row ───────────────────────────────────────────────────

function SortableMacroRow({
  macro,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  commands,
  commandsLoading,
  onDeleteCommand,
  onReorderCommands,
  // Inline add form
  showAddForm,
  addCmdText,
  addCmdDir,
  onAddCmdTextChange,
  onAddCmdDirChange,
  onAddCmdSubmit,
  onAddCmdCancel,
  // Inline edit form
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
  // Inline edit form
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
      <div
        className="flex flex-col"
        style={{
          background: "#1C1B1B",
          border: "1px solid rgba(59, 75, 63, 0.3)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* Macro header row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Drag handle */}
          <button
            className="cursor-grab active:cursor-grabbing text-[#3B4B3F] hover:text-[#849587] transition-colors"
            {...attributes}
            {...listeners}
          >
            <span className="material-symbols-outlined text-sm">drag_indicator</span>
          </button>

          {/* Expand arrow */}
          <button
            onClick={onToggle}
            className="text-[#849587] hover:text-[#E5E2E1] transition-colors"
          >
            <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "" }}>
              chevron_right
            </span>
          </button>

          {/* Name */}
          <span className="flex-1 text-sm font-medium text-[#E5E2E1] truncate">{macro.name}</span>

          {/* Agent badge */}
          {macro.runOnAgent && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: "rgba(76, 214, 255, 0.1)", color: "#4CD6FF", border: "1px solid rgba(76, 214, 255, 0.3)" }}
            >
              <span className="material-symbols-outlined text-[10px]">terminal</span>
              Agent
            </span>
          )}
          {macro.runOnAgent && macro.agentHostname && (
            <span className="text-[10px] text-[#849587] font-mono">{macro.agentHostname}</span>
          )}

          {/* Description (desktop) */}
          {macro.description && (
            <span className="hidden md:block text-xs text-[#849587] max-w-[200px] truncate">{macro.description}</span>
          )}

          {/* Actions */}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors hover:bg-[#2A2A2A] text-[#849587]"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors hover:bg-[#2A2A2A] text-[#FFB4AB]"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Expanded commands panel */}
        {expanded && (
          <div style={{ borderTop: "1px solid rgba(59, 75, 63, 0.15)" }}>
            {commandsLoading ? (
              <div className="px-4 py-3 text-xs text-[#849587]">Loading commands...</div>
            ) : commands.length === 0 && !showAddForm ? (
              <div className="px-4 py-3 text-xs text-[#849587]">No commands. Add one below.</div>
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
              <div className="px-3 py-2 space-y-2" style={{ borderTop: "1px solid rgba(59, 75, 63, 0.15)" }}>
                <input
                  className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-2 py-1.5 text-xs font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  placeholder="Command (e.g. scripts/my-script.sh)"
                  value={addCmdText}
                  onChange={(e) => onAddCmdTextChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddCmdSubmit(); }}
                  autoFocus
                />
                <input
                  className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-2 py-1.5 text-xs font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                  placeholder="Working directory (optional)"
                  value={addCmdDir}
                  onChange={(e) => onAddCmdDirChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") onAddCmdSubmit(); }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={onAddCmdSubmit}
                    className="px-2 py-1 text-xs font-medium rounded bg-[#618B6B] text-white transition-colors hover:bg-[#00E38A]"
                  >
                    Save
                  </button>
                  <button
                    onClick={onAddCmdCancel}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors hover:bg-[#2A2A2A] text-[#849587]"
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
                  className="text-xs text-[#618B6B] hover:underline inline-flex items-center gap-1"
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
      style={{
        ...style,
        background: "rgba(14, 14, 14, 0.5)",
        border: "1px solid rgba(59, 75, 63, 0.15)",
      } as React.CSSProperties}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs"
    >
      <button
        className="cursor-grab active:cursor-grabbing text-[#3B4B3F] hover:text-[#849587] transition-colors"
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-xs">drag_indicator</span>
      </button>
      <span className="text-[10px] text-[#3B4B3F] font-mono w-4">#{index}</span>

      {editing ? (
        <div className="flex flex-col flex-1 gap-1">
          <input
            className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-1.5 py-0.5 text-[10px] font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B]"
            placeholder="Command"
            value={editCmdText}
            onChange={(e) => onEditCmdTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onEditCmdSave(); if (e.key === "Escape") onEditCmdCancel(); }}
            autoFocus
          />
          <input
            className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-1.5 py-0.5 text-[10px] font-mono text-[#849587] outline-none focus:border-[#618B6B]"
            placeholder="Working directory"
            value={editCmdDir}
            onChange={(e) => onEditCmdDirChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onEditCmdSave(); if (e.key === "Escape") onEditCmdCancel(); }}
          />
          <div className="flex gap-1">
            <button onClick={onEditCmdSave} className="text-[#618B6B] text-[10px] hover:underline">Save</button>
            <button onClick={onEditCmdCancel} className="text-[#849587] text-[10px] hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-[10px] text-[#E5E2E1] truncate">{cmd.cmd}</span>
          {cmd.working_dir && (
            <span className="text-[10px] text-[#849587] font-mono truncate max-w-[120px]">{cmd.working_dir}</span>
          )}
        </>
      )}

      <div className="flex gap-1 shrink-0">
        {!editing && (
          <button onClick={onEditCmdStart} className="text-[#849587] hover:text-[#E5E2E1] transition-colors">
            <span className="material-symbols-outlined text-xs">edit</span>
          </button>
        )}
        <button onClick={onDelete} className="text-[#FFB4AB] hover:text-red-400 transition-colors">
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
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
        style={{ borderBottom: expanded ? "1px solid rgba(59, 75, 63, 0.15)" : "none" }}
      >
        <span className="material-symbols-outlined text-sm text-[#849587] transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "" }}>
          chevron_right
        </span>
        {editing ? (
          <input
            className="flex-1 bg-[#131313] border border-[#3B4B3F] rounded px-2 py-0.5 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-[#E5E2E1]">{group.name}</span>
        )}
        <span className="text-xs text-[#849587]">({macros.length})</span>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(group.name); }}
            className="px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors hover:bg-[#2A2A2A] text-[#849587]"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors hover:bg-[#2A2A2A] text-[#FFB4AB]"
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
                <div className="text-xs text-[#849587] py-2 text-center">No macros in this group.</div>
              ) : (
                macros.map((macro) => (
                  <MacroRowContainer
                    key={macro.id}
                    macro={macro}
                    onEdit={() => onEditMacro(macro)}
                    onDelete={() => onDeleteMacro(macro.id)}
                  />
                ))
              )}
            </SortableContext>
          </DndContext>
          <button
            onClick={onAddMacro}
            className="text-xs text-[#618B6B] hover:underline inline-flex items-center gap-1"
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
}: {
  macro: Macro;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commands, setCommands] = useState<MacroCommand[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);

  // Inline add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCmdText, setAddCmdText] = useState("");
  const [addCmdDir, setAddCmdDir] = useState("");

  // Inline edit form state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editCmdText, setEditCmdText] = useState("");
  const [editCmdDir, setEditCmdDir] = useState("");

  useEffect(() => {
    if (expanded && commands.length === 0 && !commandsLoading) {
      setCommandsLoading(true);
      fetch(`/api/macros/${macro.id}/commands`)
        .then((r) => r.json())
        .then((data) => {
          setCommands(data);
          setCommandsLoading(false);
        })
        .catch(() => setCommandsLoading(false));
    }
  }, [expanded, macro.id, commands.length, commandsLoading]);

  // ── Add command ──────────────────────────────────────────────────────
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

  // ── Edit command ─────────────────────────────────────────────────────
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

  // ── Delete command ───────────────────────────────────────────────────
  const handleDeleteCommandLocal = async (index: number) => {
    try {
      await fetch(`/api/macros/${macro.id}/commands?index=${index}`, { method: "DELETE" });
      setCommands((prev) => prev.filter((_, i) => i !== index));
    } catch {}
  };

  // ── Reorder commands ─────────────────────────────────────────────────
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
  const [allExpanded, setAllExpanded] = useState(true);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewMacroModal, setShowNewMacroModal] = useState(false);
  const [editMacroTarget, setEditMacroTarget] = useState<Macro | null>(null);
  const [deleteMacroTarget, setDeleteMacroTarget] = useState<Macro | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<MacroGroup | null>(null);
  const { showToast } = useToast();

  // New macro form state
  const [newMacroName, setNewMacroName] = useState("");
  const [newMacroGroup, setNewMacroGroup] = useState("");
  const [newMacroDesc, setNewMacroDesc] = useState("");
  const [newMacroCmd, setNewMacroCmd] = useState("");
  const [newMacroRunOnAgent, setNewMacroRunOnAgent] = useState(false);
  const [newMacroAgent, setNewMacroAgent] = useState("");
  const [agentOptions, setAgentOptions] = useState<{ id: number; hostname: string }[]>([]);

  const fetchMacros = useCallback(async () => {
    try {
      const res = await fetch("/api/macros");
      if (res.ok) {
        const data = await res.json();
        setGroupedMacros(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const fetchAgentOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/options");
      if (res.ok) {
        setAgentOptions(await res.json());
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMacros();
    fetchAgentOptions();
  }, [fetchMacros, fetchAgentOptions]);

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
        showToast("Group created", "success");
        setShowNewGroupModal(false);
        setNewGroupName("");
        fetchMacros();
      }
    } catch {
      showToast("Failed to create group", "error");
    }
  }, [newGroupName, showToast, fetchMacros]);

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
          runOnAgent: newMacroRunOnAgent,
          agentHostname: newMacroAgent,
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
  }, [newMacroName, newMacroDesc, newMacroGroup, newMacroCmd, newMacroRunOnAgent, newMacroAgent, showToast, fetchMacros]);

  const resetNewMacroForm = () => {
    setNewMacroName("");
    setNewMacroDesc("");
    setNewMacroGroup("");
    setNewMacroCmd("");
    setNewMacroRunOnAgent(false);
    setNewMacroAgent("");
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
          runOnAgent: editMacroTarget.runOnAgent,
          agentHostname: editMacroTarget.agentHostname,
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

  const handleReorderMacros = useCallback(async (macroIds: number[]) => {
    // Find which group these macros belong to
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
          <h1 className="text-2xl font-bold text-[#E5E2E1] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            Admin
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setAllExpanded(!allExpanded)}
              className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
              style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            >
              {allExpanded ? "Compress All" : "Expand All"}
            </button>
            <Button onClick={() => { setNewGroupName(""); setShowNewGroupModal(true); }}>
              New Group
            </Button>
            <Button onClick={() => { resetNewMacroForm(); setShowNewMacroModal(true); }}>
              New Macro
            </Button>
          </div>
        </div>

        {/* Groups list */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[#849587]">Loading...</div>
        ) : groupedMacros.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#849587] gap-3">
            <span className="material-symbols-outlined text-4xl">settings</span>
            <p>No macros or groups yet.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "#3B4B3F transparent" }}>
            {groupedMacros.map((g) => (
              <GroupCard
                key={g.group?.id || "ungrouped"}
                group={g.group || { id: 0, name: "Ungrouped", ord: 999 }}
                macros={g.macros}
                expanded={allExpanded}
                onToggle={() => {}}
                onEdit={fetchMacros}
                onDelete={() => g.group && setDeleteGroupTarget(g.group)}
                onReorderMacros={handleReorderMacros}
                onEditMacro={(macro) => setEditMacroTarget({ ...macro })}
                onDeleteMacro={(id) => setDeleteMacroTarget(groupedMacros.flatMap((x) => x.macros).find((m) => m.id === id) || null)}
                onAddMacro={() => { resetNewMacroForm(); setShowNewMacroModal(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── New Group Modal ────────────────────────────────────────────── */}
      <Modal open={showNewGroupModal} onClose={() => setShowNewGroupModal(false)} title="New Group">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#849587] mb-1">Group Name</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
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
            <label className="block text-xs text-[#849587] mb-1">Name *</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={newMacroName}
              onChange={(e) => setNewMacroName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-[#849587] mb-1">Group</label>
            <select
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
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
            <label className="block text-xs text-[#849587] mb-1">Description</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={newMacroDesc}
              onChange={(e) => setNewMacroDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-[#849587] mb-1">Initial Command</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              list="cmd-shortcuts"
              value={newMacroCmd}
              onChange={(e) => setNewMacroCmd(e.target.value)}
              placeholder="e.g. scripts/my-script.sh"
            />
            <datalist id="cmd-shortcuts">
              {COMMAND_SHORTCUTS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="run-on-agent"
              checked={newMacroRunOnAgent}
              onChange={(e) => setNewMacroRunOnAgent(e.target.checked)}
              className="accent-[#618B6B]"
            />
            <label htmlFor="run-on-agent" className="text-sm text-[#E5E2E1]">Run on Agent</label>
          </div>

          {newMacroRunOnAgent && (
            <div>
              <label className="block text-xs text-[#849587] mb-1">Agent Hostname</label>
              <select
                className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={newMacroAgent}
                onChange={(e) => setNewMacroAgent(e.target.value)}
              >
                <option value="">Select agent...</option>
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.hostname}>{a.hostname}</option>
                ))}
              </select>
            </div>
          )}

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
            <label className="block text-xs text-[#849587] mb-1">Name *</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={editMacroTarget?.name || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, name: e.target.value } : null)}
            />
          </div>

          <div>
            <label className="block text-xs text-[#849587] mb-1">Description</label>
            <input
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={editMacroTarget?.description || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, description: e.target.value } : null)}
            />
          </div>

          <div>
            <label className="block text-xs text-[#849587] mb-1">Group</label>
            <select
              className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
              value={editMacroTarget?.groupName || ""}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, groupName: e.target.value } : null)}
            >
              {groupedMacros.map((g) => g.group && (
                <option key={g.group.id} value={g.group.name}>{g.group.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit-run-on-agent"
              checked={editMacroTarget?.runOnAgent || false}
              onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, runOnAgent: e.target.checked } : null)}
              className="accent-[#618B6B]"
            />
            <label htmlFor="edit-run-on-agent" className="text-sm text-[#E5E2E1]">Run on Agent</label>
          </div>

          {editMacroTarget?.runOnAgent && (
            <div>
              <label className="block text-xs text-[#849587] mb-1">Agent Hostname</label>
              <select
                className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                value={editMacroTarget?.agentHostname || ""}
                onChange={(e) => setEditMacroTarget((prev) => prev ? { ...prev, agentHostname: e.target.value } : null)}
              >
                <option value="">Select agent...</option>
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.hostname}>{a.hostname}</option>
                ))}
              </select>
            </div>
          )}

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
        <p className="text-sm text-[#849587]">
          Are you sure you want to delete <strong className="text-[#E5E2E1]">{deleteMacroTarget?.name}</strong>?
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
        <p className="text-sm text-[#849587]">
          Are you sure you want to delete this group? Its macros will remain as ungrouped.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
