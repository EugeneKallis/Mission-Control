"use client";

import { useEffect, useState } from "react";
import { closestCenter, DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NAV_BY_KEY, NAV_COLOR_CLASSES, NAV_COLORS, NAV_ENTRIES, NAV_ICONS, defaultSidebarLayout, type NavCustomization, type NavGroup, type SidebarLayout } from "@/lib/nav-registry";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/toast-provider";
function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState("");
  const matches = NAV_ICONS.filter((icon) => icon.includes(query.trim().toLowerCase()));
  return <div>
    <label className="relative block"><span className="material-symbols-outlined absolute left-2 top-2 text-base text-on-surface-variant">search</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search icons" aria-label="Search icons" className="w-full rounded border border-outline-variant/40 bg-bg py-2 pl-8 pr-2 text-sm text-on-surface" /></label>
    <div className="mt-2 grid max-h-56 grid-cols-4 gap-1 overflow-y-auto" role="listbox" aria-label="Icons">
      {matches.map((icon) => <button type="button" key={icon} role="option" aria-selected={value === icon} title={icon} onClick={() => onChange(icon)} className={`flex flex-col items-center gap-1 rounded p-2 text-[10px] text-on-surface-variant hover:bg-surface ${value === icon ? "bg-primary/15 text-primary ring-1 ring-primary" : ""}`}><span className="material-symbols-outlined text-xl">{icon}</span><span className="w-full truncate">{icon}</span></button>)}
    </div>
    {!matches.length && <p className="py-3 text-center text-xs text-on-surface-variant">No icons found.</p>}
  </div>;
}

function ItemRow({ itemKey, customization, onToggle, onEdit }: { itemKey: string; customization?: NavCustomization; onToggle: () => void; onEdit: () => void }) {
  const entry = NAV_BY_KEY[itemKey];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `item:${itemKey}` });
  if (!entry) return null;
  const icon = customization?.icon ?? entry.icon;
  const color = customization?.color ?? entry.color;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded border border-outline-variant/20 bg-surface px-3 py-2 ${isDragging ? "opacity-50" : ""}`}>
      <button type="button" aria-label={`Drag ${entry.label}`} className="cursor-grab text-on-surface-variant" {...attributes} {...listeners}><span className="material-symbols-outlined text-base">drag_indicator</span></button>
      <span className={`material-symbols-outlined ${NAV_COLOR_CLASSES[color] ?? NAV_COLOR_CLASSES.primary} text-base`} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{entry.label}</span>
      <button type="button" onClick={onEdit} aria-label={`Edit ${entry.label} icon and color`} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-base">palette</span></button>
      <button type="button" onClick={onToggle} aria-label={`Hide ${entry.label}`} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-base">visibility</span></button>
    </div>
  );
}
function GroupCard({ group, index, count, customizations, onToggleDefaultCollapsed, onRename, onDelete, onMove, onToggleHidden, onEditItem }: { group: NavGroup; index: number; count: number; customizations: Record<string, NavCustomization>; onToggleDefaultCollapsed: () => void; onRename: (name: string) => void; onDelete: () => void; onMove: (direction: -1 | 1) => void; onToggleHidden: (key: string) => void; onEditItem: (key: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}` });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [expanded, setExpanded] = useState(true);
  const saveName = () => { if (name.trim() && name.trim() !== group.name) onRename(name); setEditing(false); };
  return (
    <div ref={setNodeRef} className={`overflow-hidden rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container ${isOver ? "ring-1 ring-primary" : ""}`}>
      <div className="flex flex-col gap-2 border-b border-outline-variant/20 px-4 py-3 sm:flex-row sm:items-center">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full min-w-0 items-center gap-2 text-left sm:flex-1">
          <span className="material-symbols-outlined text-sm text-on-surface-variant" style={{ transform: expanded ? "rotate(90deg)" : undefined }}>chevron_right</span>
          {editing ? <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(false); }} className="min-w-0 flex-1 rounded border border-outline-variant/40 bg-bg px-2 py-0.5 text-sm text-on-surface" /> : <span className="min-w-0 flex-1 text-sm font-semibold text-on-surface">{group.name}</span>}
          <span className="shrink-0 text-xs text-on-surface-variant">({count})</span>
        </button>
        {group.id !== "ungrouped" && <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 sm:w-auto sm:shrink-0 sm:flex-nowrap">
          <label className="flex w-full items-center gap-1.5 text-xs text-on-surface-variant sm:w-auto">
            <span className="whitespace-nowrap">Collapsed by default</span>
            <ToggleSwitch enabled={group.defaultCollapsed} onChange={onToggleDefaultCollapsed} label={`${group.name} collapsed by default`} />
          </label>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-label={`Move ${group.name} up`} disabled={index === 0} onClick={() => onMove(-1)} className="min-h-11 min-w-11 p-1 text-on-surface-variant disabled:opacity-30 sm:min-h-0 sm:min-w-0"><span className="material-symbols-outlined text-base">keyboard_arrow_up</span></button>
            <button type="button" aria-label={`Move ${group.name} down`} onClick={() => onMove(1)} className="min-h-11 min-w-11 p-1 text-on-surface-variant sm:min-h-0 sm:min-w-0"><span className="material-symbols-outlined text-base">keyboard_arrow_down</span></button>
            <button type="button" onClick={() => { setName(group.name); setEditing(true); }} className="min-h-11 px-3 py-1 text-xs text-on-surface-variant hover:text-on-surface sm:min-h-0 sm:px-2">Edit</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("navigation:color-group", { detail: group.id }))} aria-label={`Change ${group.name} icon colors`} className="min-h-11 min-w-11 p-1 text-on-surface-variant hover:text-on-surface sm:min-h-0 sm:min-w-0"><span className="material-symbols-outlined text-base">palette</span></button>
          </div>
        </div>}
      </div>
      {expanded && <div className="space-y-2 p-3"><SortableContext items={group.items.map((key) => `item:${key}`)} strategy={verticalListSortingStrategy}>{group.items.length ? group.items.map((key) => <ItemRow key={key} itemKey={key} customization={customizations[key]} onToggle={() => onToggleHidden(key)} onEdit={() => onEditItem(key)} />) : <div className="py-2 text-center text-xs text-on-surface-variant">No pages in this group.</div>}</SortableContext></div>}
    </div>
  );
}

export function NavigationPage() {
  const [layout, setLayout] = useState<SidebarLayout | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<NavGroup | null>(null);
  const [editItemKey, setEditItemKey] = useState<string | null>(null);
  const [draftCustomization, setDraftCustomization] = useState<NavCustomization | null>(null);
  const [bulkColorOpen, setBulkColorOpen] = useState(false);
  const [colorGroupId, setColorGroupId] = useState<string | null>(null);
  const { showToast } = useToast();
  useEffect(() => {
    const openGroupColors = (event: Event) => {
      const groupId = (event as CustomEvent<string>).detail;
      setColorGroupId(groupId);
      setBulkColorOpen(true);
      setDraftCustomization({ icon: "", color: "primary" });
    };
    window.addEventListener("navigation:color-group", openGroupColors);
    return () => window.removeEventListener("navigation:color-group", openGroupColors);
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  useEffect(() => { fetch("/api/sidebar/layout").then((r) => r.json()).then((data) => setLayout(data)).catch(() => setLayout(defaultSidebarLayout())); }, []);
  const current = layout ?? defaultSidebarLayout();
  const persist = (next: SidebarLayout) => {
    setLayout(next);
    fetch("/api/sidebar/layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).then((response) => { if (!response.ok) throw new Error(); }).catch(() => showToast("Failed to save navigation layout", "error"));
  };
  const editItem = (key: string) => {
    const entry = NAV_BY_KEY[key];
    const saved = current.customizations[key];
    if (entry) { setEditItemKey(key); setDraftCustomization(saved ?? { icon: entry.icon, color: entry.color }); }
  };
  const saveItemCustomization = () => {
    if (!editItemKey || !draftCustomization) return;
    persist({ ...current, customizations: { ...current.customizations, [editItemKey]: draftCustomization } });
    setEditItemKey(null);
    setDraftCustomization(null);
  };
  const saveBulkColor = () => {
    if (!draftCustomization) return;
    const group = colorGroupId ? current.groups.find((candidate) => candidate.id === colorGroupId) : undefined;
    const keys = group ? group.items : NAV_ENTRIES.map((entry) => entry.key);
    const customizations = { ...current.customizations };
    for (const key of keys) {
      const entry = NAV_BY_KEY[key];
      if (entry) customizations[key] = { icon: customizations[key]?.icon ?? entry.icon, color: draftCustomization.color };
    }
    persist({ ...current, customizations });
    setBulkColorOpen(false);
    setColorGroupId(null);
    setDraftCustomization(null);
  };
  const toggleDefaultCollapsed = (id: string) => persist({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, defaultCollapsed: !group.defaultCollapsed } : group) });
  const toggleHidden = (key: string) => {
    const hidden = current.hidden.includes(key);
    const groups = current.groups.map((group) => ({ ...group, items: hidden && group.id === "ungrouped" ? [...group.items, key] : group.items.filter((item) => item !== key) }));
    persist({ ...current, groups, hidden: hidden ? current.hidden.filter((item) => item !== key) : [...current.hidden, key] });
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
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-5"><header className="flex items-center justify-between gap-4"><div><h1 className="font-display text-2xl font-bold text-on-surface">Navigation</h1><p className="text-sm text-on-surface-variant">Organize sidebar pages, customize their icons and colors, and hide unused pages.</p></div><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => { setBulkColorOpen(true); setDraftCustomization({ icon: "", color: "primary" }); }}><span className="material-symbols-outlined text-base">palette</span>Color all icons</Button><Button variant="primary" onClick={() => setShowNewGroupModal(true)}><span className="material-symbols-outlined text-base">add</span>New Group</Button></div></header><DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOver} onDragEnd={onDragEnd}><div className="space-y-3">{current.groups.map((group, index) => <GroupCard key={group.id} group={group} index={index} count={group.items.length} customizations={current.customizations ?? {}} onToggleDefaultCollapsed={() => toggleDefaultCollapsed(group.id)} onRename={(name) => renameGroup(group.id, name)} onDelete={() => setDeleteGroupTarget(group)} onMove={(direction) => moveGroup(group.id, direction)} onToggleHidden={toggleHidden} onEditItem={editItem} />)}</div></DndContext><section className="rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container p-4"><h2 className="mb-3 text-sm font-semibold text-on-surface">Hidden pages</h2>{current.hidden.length ? <div className="space-y-2">{current.hidden.map((key) => <div key={key} className="flex items-center gap-2 text-sm text-on-surface"><span className={`material-symbols-outlined text-base ${NAV_COLOR_CLASSES[current.customizations?.[key]?.color ?? NAV_BY_KEY[key]?.color ?? "primary"] ?? NAV_COLOR_CLASSES.primary}`}>{current.customizations?.[key]?.icon ?? NAV_BY_KEY[key]?.icon}</span><span className="flex-1">{NAV_BY_KEY[key]?.label}</span><button type="button" onClick={() => toggleHidden(key)} aria-label={`Show ${NAV_BY_KEY[key]?.label}`} className="text-on-surface-variant"><span className="material-symbols-outlined text-base">visibility_off</span></button></div>)}</div> : <p className="text-xs text-on-surface-variant">No hidden pages.</p>}</section></div><Modal open={editItemKey !== null || bulkColorOpen} onClose={() => { setEditItemKey(null); setBulkColorOpen(false); }} title={bulkColorOpen ? "Change all icon colors" : `Customize ${editItemKey ? NAV_BY_KEY[editItemKey]?.label : "navigation link"}`} icon="palette" actions={<><Button onClick={() => { setEditItemKey(null); setBulkColorOpen(false); }}>Cancel</Button><Button variant="primary" onClick={bulkColorOpen ? saveBulkColor : saveItemCustomization}>Save</Button></>}>{draftCustomization && <div className="space-y-4">{!bulkColorOpen && <div><p className="mb-2 text-sm font-medium text-on-surface">Icon</p><IconPicker value={draftCustomization.icon} onChange={(icon) => setDraftCustomization({ ...draftCustomization, icon })} /></div>}<div><p className="mb-2 text-sm font-medium text-on-surface">Color</p><div className="flex flex-wrap gap-2">{NAV_COLORS.map((color) => <button type="button" key={color} onClick={() => setDraftCustomization({ ...draftCustomization, color })} aria-label={`${color} color`} className={`size-8 rounded-full ${NAV_COLOR_CLASSES[color]} bg-current ${draftCustomization.color === color ? "ring-2 ring-on-surface ring-offset-2 ring-offset-surface-container" : ""}`} />)}</div></div></div>}</Modal><Modal open={showNewGroupModal} onClose={() => setShowNewGroupModal(false)} title="New navigation group" icon="create_new_folder" actions={<><Button onClick={() => setShowNewGroupModal(false)}>Cancel</Button><Button variant="primary" onClick={() => { const name = newGroupName.trim(); if (!name) return; persist({ ...current, groups: [...current.groups, { id: crypto.randomUUID(), name, defaultCollapsed: false, items: [] }] }); setNewGroupName(""); setShowNewGroupModal(false); }}>Create</Button></>}><label className="block text-sm text-on-surface-variant">Group name<input autoFocus value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="mt-2 w-full rounded border border-outline-variant/40 bg-bg px-3 py-2 text-sm text-on-surface" /></label></Modal><ConfirmDialog open={deleteGroupTarget !== null} onClose={() => setDeleteGroupTarget(null)} onConfirm={deleteGroup} title="Delete navigation group" confirmLabel="Delete group">Pages in this group will move to Ungrouped.</ConfirmDialog></div>;
}
