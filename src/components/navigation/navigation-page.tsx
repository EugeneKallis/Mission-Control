"use client";

import { useEffect, useState } from "react";
import { closestCenter, DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NAV_BY_KEY, defaultSidebarLayout, type NavGroup, type SidebarLayout } from "@/lib/nav-registry";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast-provider";

function ItemRow({ itemKey, onToggle }: { itemKey: string; onToggle: () => void }) {
  const entry = NAV_BY_KEY[itemKey];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `item:${itemKey}` });
  if (!entry) return null;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded border border-outline-variant/20 bg-surface px-3 py-2 ${isDragging ? "opacity-50" : ""}`}>
      <button type="button" aria-label={`Drag ${entry.label}`} className="cursor-grab text-on-surface-variant" {...attributes} {...listeners}><span className="material-symbols-outlined text-base">drag_indicator</span></button>
      <span className={`material-symbols-outlined text-${entry.color}-500 text-base`} aria-hidden="true">{entry.icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{entry.label}</span>
      <button type="button" onClick={onToggle} aria-label={`Hide ${entry.label}`} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-base">visibility</span></button>
    </div>
  );
}

function GroupCard({ group, index, count, onToggle, onRename, onDelete, onMove, onToggleHidden }: { group: NavGroup; index: number; count: number; onToggle: () => void; onRename: (name: string) => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; onToggleHidden: (key: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}` });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const saveName = () => { if (name.trim() && name.trim() !== group.name) onRename(name); setEditing(false); };
  return (
    <div ref={setNodeRef} className={`overflow-hidden rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container ${isOver ? "ring-1 ring-primary" : ""}`}>
      <div className="flex items-center gap-2 border-b border-outline-variant/20 px-4 py-3">
        <button type="button" onClick={onToggle} aria-expanded={!group.collapsed} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="material-symbols-outlined text-sm text-on-surface-variant" style={{ transform: group.collapsed ? undefined : "rotate(90deg)" }}>chevron_right</span>
          {editing ? <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(false); }} className="min-w-0 flex-1 rounded border border-outline-variant/40 bg-bg px-2 py-0.5 text-sm text-on-surface" /> : <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface">{group.name}</span>}
          <span className="text-xs text-on-surface-variant">({count})</span>
        </button>
        {group.id !== "ungrouped" && <div className="flex gap-1">
          <button type="button" aria-label={`Move ${group.name} up`} disabled={index === 0} onClick={() => onMove(-1)} className="p-1 text-on-surface-variant disabled:opacity-30"><span className="material-symbols-outlined text-base">keyboard_arrow_up</span></button>
          <button type="button" aria-label={`Move ${group.name} down`} onClick={() => onMove(1)} className="p-1 text-on-surface-variant"><span className="material-symbols-outlined text-base">keyboard_arrow_down</span></button>
          <button type="button" onClick={() => { setName(group.name); setEditing(true); }} className="px-2 py-1 text-xs text-on-surface-variant hover:text-on-surface">Edit</button>
          <button type="button" onClick={onDelete} className="px-2 py-1 text-xs text-error">Delete</button>
        </div>}
      </div>
      {!group.collapsed && <div className="space-y-2 p-3"><SortableContext items={group.items.map((key) => `item:${key}`)} strategy={verticalListSortingStrategy}>{group.items.length ? group.items.map((key) => <ItemRow key={key} itemKey={key} onToggle={() => onToggleHidden(key)} />) : <div className="py-2 text-center text-xs text-on-surface-variant">No pages in this group.</div>}</SortableContext></div>}
    </div>
  );
}

export function NavigationPage() {
  const [layout, setLayout] = useState<SidebarLayout | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<NavGroup | null>(null);
  const { showToast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  useEffect(() => { fetch("/api/sidebar/layout").then((r) => r.json()).then((data) => setLayout(data)).catch(() => setLayout(defaultSidebarLayout())); }, []);
  const current = layout ?? defaultSidebarLayout();
  const persist = (next: SidebarLayout) => {
    setLayout(next);
    fetch("/api/sidebar/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).then((response) => { if (!response.ok) throw new Error(); }).catch(() => showToast("Failed to save navigation layout", "error"));
  };
  const toggleGroup = (id: string) => persist({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, collapsed: !group.collapsed } : group) });
  const toggleHidden = (key: string) => {
    const hidden = current.hidden.includes(key);
    const groups = current.groups.map((group) => ({ ...group, items: hidden && group.id === "ungrouped" ? [...group.items, key] : group.items.filter((item) => item !== key) }));
    persist({ groups, hidden: hidden ? current.hidden.filter((item) => item !== key) : [...current.hidden, key] });
  };
  const renameGroup = (id: string, name: string) => persist({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, name: name.trim() } : group) });
  const moveGroup = (id: string, direction: -1 | 1) => {
    const from = current.groups.findIndex((group) => group.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.groups.length || current.groups[to].id === "ungrouped") return;
    persist({ ...current, groups: arrayMove(current.groups, from, to) });
  };
  const deleteGroup = () => {
    if (!deleteGroupTarget) return;
    const target = deleteGroupTarget;
    persist({ ...current, groups: current.groups.filter((group) => group.id !== target.id).map((group) => group.id === "ungrouped" ? { ...group, items: [...group.items, ...target.items] } : group) });
    setDeleteGroupTarget(null);
  };
  const moveItem = (key: string, targetId: string, beforeKey?: string) => {
    const groups = current.groups.map((group) => ({ ...group, items: group.items.filter((item) => item !== key) }));
    const target = groups.find((group) => group.id === targetId);
    if (!target) return current;
    const index = beforeKey ? target.items.indexOf(beforeKey) : -1;
    target.items.splice(index < 0 ? target.items.length : index, 0, key);
    return { ...current, groups };
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !String(active.id).startsWith("item:")) return;
    const key = String(active.id).slice(5);
    const overId = String(over.id);
    const targetId = overId.startsWith("group:") ? overId.slice(6) : current.groups.find((group) => group.items.includes(overId.slice(5)))?.id;
    if (!targetId) return;
    const before = overId.startsWith("item:") ? overId.slice(5) : undefined;
    const source = current.groups.find((group) => group.items.includes(key));
    if (source?.id !== targetId) setLayout(moveItem(key, targetId, before));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !String(active.id).startsWith("item:")) return;
    const key = String(active.id).slice(5);
    const overKey = String(over.id).startsWith("item:") ? String(over.id).slice(5) : undefined;
    const group = current.groups.find((candidate) => candidate.items.includes(key));
    if (!group) return;
    const next = overKey && group.items.includes(overKey) ? { ...current, groups: current.groups.map((candidate) => candidate.id === group.id ? { ...candidate, items: arrayMove(candidate.items, candidate.items.indexOf(key), candidate.items.indexOf(overKey)) } : candidate) } : current;
    persist(next);
  };
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-5"><header className="flex items-center justify-between gap-4"><div><h1 className="font-display text-2xl font-bold text-on-surface">Navigation</h1><p className="text-sm text-on-surface-variant">Organize sidebar pages into groups and hide unused pages.</p></div><Button variant="primary" onClick={() => setShowNewGroupModal(true)}><span className="material-symbols-outlined text-base">add</span>New Group</Button></header><DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOver} onDragEnd={onDragEnd}><div className="space-y-3">{current.groups.map((group, index) => <GroupCard key={group.id} group={group} index={index} count={group.items.length} onToggle={() => toggleGroup(group.id)} onRename={(name) => renameGroup(group.id, name)} onDelete={() => setDeleteGroupTarget(group)} onMove={(direction) => moveGroup(group.id, direction)} onToggleHidden={toggleHidden} />)}</div></DndContext><section className="rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container p-4"><h2 className="mb-3 text-sm font-semibold text-on-surface">Hidden pages</h2>{current.hidden.length ? <div className="space-y-2">{current.hidden.map((key) => <div key={key} className="flex items-center gap-2 text-sm text-on-surface"><span className="material-symbols-outlined text-base">{NAV_BY_KEY[key]?.icon}</span><span className="flex-1">{NAV_BY_KEY[key]?.label}</span><button type="button" onClick={() => toggleHidden(key)} aria-label={`Show ${NAV_BY_KEY[key]?.label}`} className="text-on-surface-variant"><span className="material-symbols-outlined text-base">visibility_off</span></button></div>)}</div> : <p className="text-xs text-on-surface-variant">No hidden pages.</p>}</section></div><Modal open={showNewGroupModal} onClose={() => setShowNewGroupModal(false)} title="New navigation group" icon="create_new_folder" actions={<><Button onClick={() => setShowNewGroupModal(false)}>Cancel</Button><Button variant="primary" onClick={() => { const name = newGroupName.trim(); if (!name) return; persist({ ...current, groups: [...current.groups, { id: crypto.randomUUID(), name, collapsed: false, items: [] }] }); setNewGroupName(""); setShowNewGroupModal(false); }}>Create</Button></>}><label className="block text-sm text-on-surface-variant">Group name<input autoFocus value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="mt-2 w-full rounded border border-outline-variant/40 bg-bg px-3 py-2 text-sm text-on-surface" /></label></Modal><ConfirmDialog open={deleteGroupTarget !== null} onClose={() => setDeleteGroupTarget(null)} onConfirm={deleteGroup} title="Delete navigation group" confirmLabel="Delete group">Pages in this group will move to Ungrouped.</ConfirmDialog></div>;
}
