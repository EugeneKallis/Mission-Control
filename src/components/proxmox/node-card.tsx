"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PveNodeDetail, PveGuest, PveStoragePool } from "./proxmox-types";
import type { PveThresholds, PveResourceAlert } from "@/lib/pve-alerts";
import { DEFAULT_PVE_THRESHOLDS, guestAlerts, storageAlerts, thresholdColorFor, isGuestBreaching, isStorageBreaching } from "@/lib/pve-alerts";

export interface GuestRestartRequest {
  node: string;
  vmid: number;
  type: "vm" | "lxc";
  name: string;
}

interface NodeCardProps {
  node: PveNodeDetail;
  endpointName: string;
  query?: string;
  thresholds?: PveThresholds;
  breachOnly?: boolean;
  onRestartGuest?: (request: GuestRestartRequest) => void;
}

function alertClassForPve(
  value: number,
  max: number,
  thresholds: PveThresholds,
  metric: "cpu" | "memory" | "storage",
): string {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const { color } = thresholdColorFor(pct, thresholds, metric);
  if (color === "error") return "bg-error/10 border-error/30";
  if (color === "warning") return "bg-warning/10 border-warning/30";
  return "";
}

function rowClassForGuest(guest: PveGuest, thresholds: PveThresholds): string {
  if (guest.status !== "running") return "";
  const alerts = guestAlerts(guest, thresholds);
  if (alerts.length === 0) return "";
  const error = alerts.some((a) => thresholdColorFor(a.pct, thresholds, a.metric).color === "error");
  const warning = alerts.some((a) => thresholdColorFor(a.pct, thresholds, a.metric).color === "warning");
  if (error) return "bg-error/10 border-error/30";
  if (warning) return "bg-warning/10 border-warning/30";
  return "";
}

function rowClassForStorage(pool: PveStoragePool, thresholds: PveThresholds): string {
  const alerts = storageAlerts(pool, thresholds);
  if (alerts.length === 0) return "";
  const { color } = thresholdColorFor(alerts[0].pct, thresholds, "storage");
  if (color === "error") return "bg-error/10 border-error/30";
  if (color === "warning") return "bg-warning/10 border-warning/30";
  return "";
}

/** Result of matching a search query against a node's content. */
export interface NodeQueryMatch {
  node: boolean;
  vms: boolean;
  containers: boolean;
  storage: boolean;
}

/**
 * Pure helper: does a (case-insensitive) query match this node's own name/status
 * or any of its VMs, LXC containers, or storage pools?
 * An empty query matches everything.
 */
export function matchNodeQuery(query: string, node: PveNodeDetail): NodeQueryMatch {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { node: true, vms: true, containers: true, storage: true };
  }
  const includes = (value: string | number) => String(value).toLowerCase().includes(q);
  return {
    node: includes(node.node.node) || includes(node.node.status),
    vms: node.vms.some((v) => includes(v.name) || includes(v.vmid) || includes(v.status)),
    containers: node.containers.some((c) => includes(c.name) || includes(c.vmid) || includes(c.status)),
    storage: node.storage.some((s) => includes(s.storage) || includes(s.type)),
  };
}

/**
 * Pure helper: filter a list of guests to those whose own fields (name, vmid,
 * or status) match the query. An empty query returns the full list.
 */
export function filterGuests(guests: PveGuest[], query: string): PveGuest[] {
  const q = query.trim().toLowerCase();
  if (!q) return guests;
  const includes = (value: string | number) => String(value).toLowerCase().includes(q);
  return guests.filter((guest) => includes(guest.name) || includes(guest.vmid) || includes(guest.status));
}

/**
 * Pure helper: filter storage pools to those whose own fields (name or type)
 * match the query. An empty query returns the full list.
 */
export function filterStorage(pools: PveStoragePool[], query: string): PveStoragePool[] {
  const q = query.trim().toLowerCase();
  if (!q) return pools;
  const includes = (value: string) => value.toLowerCase().includes(q);
  return pools.filter((pool) => includes(pool.storage) || includes(pool.type));
}

type SortDirection = "asc" | "desc";
type GuestSortKey = "vmid" | "name" | "status" | "cpu" | "memory" | "disk" | "uptime";
type StorageSortKey = "storage" | "type" | "usage" | "avail";

interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function ratio(value: number, max: number): number {
  return max > 0 ? value / max : 0;
}

function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return {
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortGuests(guests: PveGuest[], sort: SortState<GuestSortKey>): PveGuest[] {
  const valueFor = (guest: PveGuest): string | number => {
    switch (sort.key) {
      case "vmid": return guest.vmid;
      case "name": return guest.name;
      case "status": return guest.status;
      case "cpu": return guest.cpu;
      case "memory": return ratio(guest.mem, guest.maxmem);
      case "disk": return ratio(guest.disk, guest.maxdisk);
      case "uptime": return guest.uptime;
    }
  };

  const multiplier = sort.direction === "asc" ? 1 : -1;
  return [...guests].sort((a, b) => {
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    const compared = typeof aValue === "string" && typeof bValue === "string"
      ? textCollator.compare(aValue, bValue)
      : Number(aValue) - Number(bValue);
    return compared * multiplier;
  });
}

export function sortStorage(pools: PveStoragePool[], sort: SortState<StorageSortKey>): PveStoragePool[] {
  const valueFor = (pool: PveStoragePool): string | number => {
    switch (sort.key) {
      case "storage": return pool.storage;
      case "type": return pool.type;
      case "usage": return ratio(pool.used, pool.total);
      case "avail": return pool.avail;
    }
  };

  const multiplier = sort.direction === "asc" ? 1 : -1;
  return [...pools].sort((a, b) => {
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    const compared = typeof aValue === "string" && typeof bValue === "string"
      ? textCollator.compare(aValue, bValue)
      : Number(aValue) - Number(bValue);
    return compared * multiplier;
  });
}

function SortHeader<K extends string>({
  label,
  scope,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  scope: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className: string;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const nextDirection = active && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 hover:text-on-surface transition-colors ${align === "right" ? "justify-end" : "justify-start"} ${active ? "text-on-surface-variant" : ""}`}
        aria-label={`Sort by ${label} in ${scope}, ${active ? `currently ${sort.direction === "asc" ? "ascending" : "descending"}` : "not currently sorted"}. Activate to sort ${nextDirection}.`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-[9px]">
          {active ? (sort.direction === "asc" ? "\u25B2" : "\u25BC") : "\u2195"}
        </span>
      </button>
    </div>
  );
}

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function humanUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-success/20 text-success",
    running: "bg-success/20 text-success",
    offline: "bg-error/20 text-error",
    stopped: "bg-error/20 text-error",
    unknown: "bg-warning/20 text-warning",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-surface-container-high/30 text-on-surface-variant"}`}>
      {status}
    </span>
  );
}

function ProgressBar({
  value,
  max,
  thresholds,
  metric,
  baseColor = "bg-primary",
}: {
  value: number;
  max: number;
  thresholds?: PveThresholds;
  metric: "cpu" | "memory" | "storage";
  baseColor?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = thresholds
    ? thresholdColorFor(pct, thresholds, metric).className || baseColor
    : pct > 90
      ? "bg-error"
      : pct > 75
        ? "bg-warning"
        : baseColor;
  return (
    <div className="w-full bg-outline-variant/30 rounded-full h-2 overflow-hidden">
      <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function GuestRow({
  guest,
  nodeName,
  thresholds,
  onRestartGuest,
}: {
  guest: PveGuest;
  nodeName: string;
  thresholds?: PveThresholds;
  onRestartGuest?: (request: GuestRestartRequest) => void;
}) {
  const effectiveThresholds = thresholds ?? DEFAULT_PVE_THRESHOLDS;
  const alerts = guest.status === "running" ? guestAlerts(guest, effectiveThresholds) : [];
  const alertClass = alerts.length > 0 ? rowClassForGuest(guest, effectiveThresholds) : "";
  return (
    <div role="row" className={`flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container/50 rounded-[var(--radius-button)] transition-colors ${alertClass}`}>
      <span role="cell" className="text-on-surface-variant text-xs font-mono w-12 shrink-0">{guest.vmid}</span>
      <span role="cell" className="flex-1 text-sm font-medium text-on-surface truncate">{guest.name}</span>
      <span role="cell"><StatusPill status={guest.status} /></span>
      <div role="cell" className="w-24 shrink-0 hidden sm:block">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-on-surface-variant w-8 text-right">{(guest.cpu * 100).toFixed(0)}%</span>
          <div className="flex-1">
            <ProgressBar value={guest.cpu * guest.cpus * 100} max={guest.cpus * 100} thresholds={thresholds} metric="cpu" baseColor="bg-primary" />
          </div>
        </div>
      </div>
      <div role="cell" className="w-32 shrink-0 hidden md:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.mem} max={guest.maxmem} thresholds={thresholds} metric="memory" baseColor="bg-secondary" />
          <span className="text-xs text-on-surface-variant w-20 text-right">{humanBytes(guest.mem)}/{humanBytes(guest.maxmem)}</span>
        </div>
      </div>
      <div role="cell" className="w-32 shrink-0 hidden lg:block">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={guest.disk} max={guest.maxdisk} thresholds={thresholds} metric="storage" baseColor="bg-success" />
          <span className="text-xs text-on-surface-variant w-20 text-right">{humanBytes(guest.disk)}/{humanBytes(guest.maxdisk)}</span>
        </div>
      </div>
      <span role="cell" className="text-xs text-on-surface-variant/60 w-14 text-right shrink-0 hidden xl:block">
        {guest.status === "running" ? humanUptime(guest.uptime) : "\u2014"}
      </span>
      {alerts.length > 0 && (
        <span role="cell" className="shrink-0">
          <BreachReasonChips alerts={alerts} thresholds={effectiveThresholds} />
        </span>
      )}
      {onRestartGuest && (
        <span role="cell" className="w-20 shrink-0 text-right">
          {guest.status === "running" && (
            <button
              type="button"
              onClick={() => onRestartGuest({ node: nodeName, vmid: guest.vmid, type: guest.type, name: guest.name })}
              className="px-2 py-1 text-xs font-medium text-warning hover:text-warning/80 hover:bg-warning/10 rounded-[var(--radius-button)] transition-colors"
              aria-label={`Restart ${guest.type === "vm" ? "VM" : "LXC container"} ${guest.name} (${guest.vmid})`}
            >
              Restart
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function BreachReasonChips({ alerts, thresholds }: { alerts: PveResourceAlert[]; thresholds: PveThresholds }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex items-center gap-1" aria-label="Breach reasons">
      {alerts.map((alert) => {
        const { color } = thresholdColorFor(alert.pct, thresholds, alert.metric);
        const classes =
          color === "error"
            ? "bg-error/20 text-error border-error/30"
            : "bg-warning/20 text-warning border-warning/30";
        return (
          <span
            key={alert.metric}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${classes}`}
          >
            {alert.metric} {alert.pct.toFixed(0)}%
          </span>
        );
      })}
    </div>
  );
}

function StorageRow({ pool, thresholds }: { pool: PveStoragePool; thresholds?: PveThresholds }) {
  const effectiveThresholds = thresholds ?? DEFAULT_PVE_THRESHOLDS;
  const alerts = storageAlerts(pool, effectiveThresholds);
  const alertClass = alerts.length > 0 ? rowClassForStorage(pool, effectiveThresholds) : "";
  return (
    <div role="row" className={`flex items-center gap-3 px-4 py-2 hover:bg-surface-container/50 rounded-[var(--radius-button)] transition-colors ${alertClass}`}>
      <span role="cell" className="flex-1 text-sm font-medium text-on-surface truncate">{pool.storage}</span>
      <span role="cell" className="text-xs text-on-surface-variant w-16 shrink-0">{pool.type}</span>
      <div role="cell" className="w-48 shrink-0">
        <div className="flex items-center gap-1.5">
          <ProgressBar value={pool.used} max={pool.total} thresholds={thresholds} metric="storage" baseColor="bg-success" />
          <span className="text-xs text-on-surface-variant w-24 text-right">{humanBytes(pool.used)}/{humanBytes(pool.total)}</span>
        </div>
      </div>
      <span role="cell" className="text-xs text-on-surface-variant/60 w-16 text-right shrink-0">{humanBytes(pool.avail)} free</span>
      {alerts.length > 0 && (
        <span role="cell" className="shrink-0">
          <BreachReasonChips alerts={alerts} thresholds={effectiveThresholds} />
        </span>
      )}
    </div>
  );
}

function GuestTable({
  guests,
  scope,
  sort,
  onSort,
  emptyText,
  nodeName,
  thresholds,
  onRestartGuest,
}: {
  guests: PveGuest[];
  scope: string;
  sort: SortState<GuestSortKey>;
  onSort: (key: GuestSortKey) => void;
  emptyText: string;
  nodeName: string;
  thresholds?: PveThresholds;
  onRestartGuest?: (request: GuestRestartRequest) => void;
}) {
  return (
    <div role="table" aria-label={scope}>
      <div role="row" className="flex items-center gap-3 px-4 py-1.5 text-[10px] text-on-surface-variant uppercase tracking-wide">
        <SortHeader label="ID" scope={scope} sortKey="vmid" sort={sort} onSort={onSort} className="w-12 shrink-0" />
        <SortHeader label="Name" scope={scope} sortKey="name" sort={sort} onSort={onSort} className="flex-1" />
        <SortHeader label="Status" scope={scope} sortKey="status" sort={sort} onSort={onSort} className="w-16 shrink-0" />
        <SortHeader label="CPU" scope={scope} sortKey="cpu" sort={sort} onSort={onSort} className="w-24 shrink-0 hidden sm:flex" />
        <SortHeader label="Memory" scope={scope} sortKey="memory" sort={sort} onSort={onSort} className="w-32 shrink-0 hidden md:flex" />
        <SortHeader label="Disk" scope={scope} sortKey="disk" sort={sort} onSort={onSort} className="w-32 shrink-0 hidden lg:flex" />
        <SortHeader label="Uptime" scope={scope} sortKey="uptime" sort={sort} onSort={onSort} className="w-14 shrink-0 hidden xl:flex" />
        {onRestartGuest && <span role="columnheader" className="w-20 shrink-0 text-right">Action</span>}
      </div>
      {guests.length === 0 ? (
        <p className="text-on-surface-variant text-sm py-4 text-center">{emptyText}</p>
      ) : (
        guests.map((guest) => <GuestRow key={guest.vmid} guest={guest} nodeName={nodeName} thresholds={thresholds} onRestartGuest={onRestartGuest} />)
      )}
    </div>
  );
}

export function NodeCard({ node, endpointName, query = "", thresholds, breachOnly = false, onRestartGuest }: NodeCardProps) {
  const id = useId();
  const effectiveThresholds = thresholds ?? DEFAULT_PVE_THRESHOLDS;
  const [expanded, setExpanded] = useState(true);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [previousBreachOnly, setPreviousBreachOnly] = useState(breachOnly);
  // A user's explicit disclosure choice for the current query string, so
  // auto-expansion can be overridden by a manual collapse/expand while a
  // search is active.
  const [expandedOverride, setExpandedOverride] = useState<{ query: string; breachOnly: boolean; expanded: boolean } | null>(null);
  const [tab, setTab] = useState<"vms" | "lxc" | "storage">("lxc");
  // A tab the user explicitly selected for the current query string.
  // Auto-selection takes over again as soon as the query changes.
  const [tabPinnedAt, setTabPinnedAt] = useState<string | null>(null);
  const queryActive = query.trim().length > 0;
  const match = useMemo(() => matchNodeQuery(query, node), [query, node]);
  const contentMatch = match.vms || match.containers || match.storage;

  // While a search query is active every rendered node is a match (the page
  // filters first), so cards auto-expand — including node-only and
  // endpoint-only matches. A manual disclosure toggle pins the choice for the
  // current query string; clearing the query restores the default expanded state.
  // Reset to the expanded baseline whenever the query changes. Setting state
  // during render is deliberate here: it synchronizes this local display
  // state to the prop before children render, avoiding a collapse flicker.
  if (previousQuery !== query || previousBreachOnly !== breachOnly) {
    setPreviousQuery(query);
    setPreviousBreachOnly(breachOnly);
    setExpanded(true);
    // A query-scoped override is only valid for the exact view that created it.
    // Reset it whenever the query or breach-only filter changes so re-entering
    // the same view starts fresh with the default expanded state.
    setExpandedOverride(null);
  }

  const effectiveExpanded = expandedOverride?.query === query && expandedOverride?.breachOnly === breachOnly
    ? expandedOverride.expanded
    : queryActive || breachOnly
      ? true
      : expanded;

  // Categories that actually exist on this node — tabs for empty categories
  // are omitted so the tab strip never shows meaningless options.
  const availableTabs = useMemo<Array<"vms" | "lxc" | "storage">>(() => {
    const tabs: Array<"vms" | "lxc" | "storage"> = [];
    if (node.containers.length > 0) tabs.push("lxc");
    if (node.vms.length > 0) tabs.push("vms");
    if (node.storage.length > 0) tabs.push("storage");
    return tabs;
  }, [node]);
  const fallbackTab: "vms" | "lxc" | "storage" = availableTabs[0] ?? "lxc";

  // Auto-select a category with matches when the query changes and the user
  // has not pinned a tab for this exact query; otherwise keep the user's last
  // tab (clamped to the categories this node actually has).
  const derivedTab: "vms" | "lxc" | "storage" =
    queryActive && contentMatch
      ? match.storage
        ? "storage"
        : match.vms
          ? "vms"
          : "lxc"
      : availableTabs.includes(tab)
        ? tab
        : fallbackTab;
  const activeTab: "vms" | "lxc" | "storage" =
    tabPinnedAt === query && availableTabs.includes(tab)
      ? tab
      : availableTabs.includes(derivedTab)
        ? derivedTab
        : fallbackTab;

  // While a search is active, the page filters nodes first and only matching
  // cards are rendered. To preserve the user's tab choice across query changes
  // (e.g. pve-2 -> then "pve-2"), pin the currently selected tab the moment it
  // is derived while a query is active.
  useEffect(() => {
    if (queryActive && tab !== activeTab) {
      setTab(activeTab);
      setTabPinnedAt(query);
    }
  }, [query, queryActive, activeTab, tab]);

  const disclosureId = `${id}-disclosure`;
  const panelId = `${id}-panel`;
  const tabId = (name: "vms" | "lxc" | "storage") => `${id}-tab-${name}`;
  const tabpanelId = (name: "vms" | "lxc" | "storage") => `${id}-panel-${name}`;

  const handleToggle = () => {
    if (queryActive || breachOnly) {
      setExpandedOverride({ query, breachOnly, expanded: !effectiveExpanded });
    } else {
      setExpanded((prev) => !prev);
    }
  };

  const handleTabSelect = (next: "vms" | "lxc" | "storage") => {
    setTab(next);
    setTabPinnedAt(query);
  };

  // Pin the active tab for the initial render so a manual disclosure toggle
  // before any query change does not lose its tab selection when a search is
  // later entered. The empty-query pin is ignored by auto-selection logic.
  const didPinEmpty = useRef(false);
  useEffect(() => {
    if (!didPinEmpty.current && query === "" && availableTabs.includes(tab)) {
      didPinEmpty.current = true;
      setTabPinnedAt("");
    }
  }, [query, tab, availableTabs]);

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (availableTabs.length <= 1) return;
    const order = availableTabs;
    const idx = order.indexOf(activeTab);
    let next: "vms" | "lxc" | "storage" | null = null;
    if (event.key === "ArrowRight") next = order[(idx + 1) % order.length];
    else if (event.key === "ArrowLeft") next = order[(idx - 1 + order.length) % order.length];
    else if (event.key === "Home") next = order[0];
    else if (event.key === "End") next = order[order.length - 1];
    else return;
    event.preventDefault();
    handleTabSelect(next);
    document.getElementById(tabId(next))?.focus();
  };

  const [vmSort, setVmSort] = useState<SortState<GuestSortKey>>({ key: "vmid", direction: "asc" });
  const [lxcSort, setLxcSort] = useState<SortState<GuestSortKey>>({ key: "vmid", direction: "asc" });
  const [storageSort, setStorageSort] = useState<SortState<StorageSortKey>>({ key: "storage", direction: "asc" });
  const n = node.node;

  // Leaf rows are filtered strictly by their own fields while a query is
  // active; an empty query keeps every row. In breach-only mode only resources
  // that exceed a configured threshold survive.
  const filteredVms = useMemo(() => {
    const source = breachOnly ? node.vms.filter((g) => isGuestBreaching(g, effectiveThresholds)) : node.vms;
    return filterGuests(source, query);
  }, [node.vms, query, breachOnly, effectiveThresholds]);
  const filteredContainers = useMemo(() => {
    const source = breachOnly ? node.containers.filter((g) => isGuestBreaching(g, effectiveThresholds)) : node.containers;
    return filterGuests(source, query);
  }, [node.containers, query, breachOnly, effectiveThresholds]);
  const filteredStorage = useMemo(() => {
    const source = breachOnly ? node.storage.filter((s) => isStorageBreaching(s, effectiveThresholds)) : node.storage;
    return filterStorage(source, query);
  }, [node.storage, query, breachOnly, effectiveThresholds]);

  const sortedVms = useMemo(() => sortGuests(filteredVms, vmSort), [filteredVms, vmSort]);
  const sortedContainers = useMemo(() => sortGuests(filteredContainers, lxcSort), [filteredContainers, lxcSort]);
  const sortedStorage = useMemo(() => sortStorage(filteredStorage, storageSort), [filteredStorage, storageSort]);

  // When breach-only mode is active, make sure the user lands on a tab that
  // actually has breaches. Use the same priority as search-based auto-selection.
  useEffect(() => {
    if (!breachOnly) return;
    const has = {
      lxc: filteredContainers.length > 0,
      vms: filteredVms.length > 0,
      storage: filteredStorage.length > 0,
    };
    const order: Array<"vms" | "lxc" | "storage"> = ["storage", "vms", "lxc"];
    const first = order.find((name) => has[name]);
    if (first && activeTab && !has[activeTab]) {
      setTab(first);
      setTabPinnedAt(query);
    }
  }, [breachOnly, filteredContainers.length, filteredVms.length, filteredStorage.length, activeTab, query]);

  const scopeFor = (name: "vms" | "lxc" | "storage"): string =>
    `${endpointName} ${n.node} ${name === "lxc" ? "LXC containers" : name === "vms" ? "VMs" : "storage"}`;

  // Tab counts: plain total by default, matched/total while a query or
  // breach-only filter is active so the user can see which tabs have issues.
  const countLabel = (total: number, matched: number): string =>
    queryActive || breachOnly ? `(${matched}/${total})` : total > 0 ? `(${total})` : "";

  return (
    <div className="bg-surface-container border border-outline-variant/20 rounded-[var(--radius-card)] overflow-hidden">
      {/* Header */}
      <button
        id={disclosureId}
        onClick={handleToggle}
        aria-expanded={effectiveExpanded}
        aria-controls={panelId}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container-high/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base font-semibold text-on-surface truncate">{n.node}</span>
          <StatusPill status={n.status} />
        </div>

        {/* CPU */}
        <div className="w-28 shrink-0 hidden sm:block">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">CPU</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.cpu * n.maxcpu * 100} max={n.maxcpu * 100} thresholds={thresholds} metric="cpu" baseColor="bg-primary" />
            <span className="text-xs text-on-surface-variant w-8 text-right">{(n.cpu * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* RAM */}
        <div className="w-36 shrink-0 hidden md:block">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">RAM</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.mem} max={n.maxmem} thresholds={thresholds} metric="memory" baseColor="bg-secondary" />
            <span className="text-xs text-on-surface-variant w-14 text-right">{humanBytes(n.mem)}</span>
          </div>
        </div>

        {/* Disk */}
        <div className="w-36 shrink-0 hidden lg:block">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">Disk</div>
          <div className="flex items-center gap-1.5">
            <ProgressBar value={n.disk} max={n.maxdisk} thresholds={thresholds} metric="storage" baseColor="bg-success" />
            <span className="text-xs text-on-surface-variant w-14 text-right">{humanBytes(n.disk)}</span>
          </div>
        </div>

        {/* Uptime */}
        {n.status === "online" && (
          <div className="w-16 shrink-0 hidden xl:block">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">Up</div>
            <div className="text-xs text-on-surface-variant">{humanUptime(n.uptime)}</div>
          </div>
        )}

        {/* Expand indicator */}
        <svg className={`w-4 h-4 text-on-surface-variant transition-transform ${effectiveExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {effectiveExpanded && (
        <div id={panelId} role="region" aria-labelledby={disclosureId} className="border-t border-outline-variant/15">
          {/* Tabs */}
          {availableTabs.length > 0 ? (
            <>
              <div role="tablist" aria-label={`${n.node} resource views`} className="flex gap-1 px-4 pt-3 pb-1">
                {availableTabs.map((name) => {
                  const total = name === "lxc" ? node.containers.length : name === "vms" ? node.vms.length : node.storage.length;
                  const matched = name === "lxc" ? filteredContainers.length : name === "vms" ? filteredVms.length : filteredStorage.length;
                  const label = name === "lxc" ? "LXC" : name === "vms" ? "VMs" : "Storage";
                  return (
                    <button
                      key={name}
                      id={tabId(name)}
                      role="tab"
                      aria-selected={activeTab === name}
                      aria-controls={tabpanelId(name)}
                      tabIndex={activeTab === name ? 0 : -1}
                      onClick={() => handleTabSelect(name)}
                      onKeyDown={handleTabKeyDown}
                      className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] transition-colors ${activeTab === name ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50"}`}
                    >
                      {label} {countLabel(total, matched)}
                    </button>
                  );
                })}
              </div>

              {/* Panels — all mounted so aria-controls stays valid; inactive ones hidden */}
              {availableTabs.includes("lxc") && (
                <div id={tabpanelId("lxc")} role="tabpanel" aria-labelledby={tabId("lxc")} hidden={activeTab !== "lxc"} className="px-3 pb-3">
                  <GuestTable
                    guests={sortedContainers}
                    scope={scopeFor("lxc")}
                    sort={lxcSort}
                    onSort={(key) => setLxcSort((current) => nextSort(current, key))}
                    emptyText={breachOnly ? "No LXC containers are breaching thresholds" : queryActive ? "No LXC containers match the search" : "No LXC containers on this node"}
                    nodeName={n.node}
                    thresholds={thresholds}
                    onRestartGuest={onRestartGuest}
                  />
                </div>
              )}
              {availableTabs.includes("vms") && (
                <div id={tabpanelId("vms")} role="tabpanel" aria-labelledby={tabId("vms")} hidden={activeTab !== "vms"} className="px-3 pb-3">
                  <GuestTable
                    guests={sortedVms}
                    scope={scopeFor("vms")}
                    sort={vmSort}
                    onSort={(key) => setVmSort((current) => nextSort(current, key))}
                    emptyText={breachOnly ? "No VMs are breaching thresholds" : queryActive ? "No VMs match the search" : "No VMs on this node"}
                    nodeName={n.node}
                    thresholds={thresholds}
                    onRestartGuest={onRestartGuest}
                  />
                </div>
              )}
              {availableTabs.includes("storage") && (
                <div id={tabpanelId("storage")} role="tabpanel" aria-labelledby={tabId("storage")} hidden={activeTab !== "storage"} className="px-3 pb-3">
                  <div role="table" aria-label={scopeFor("storage")}>
                    <div className="overflow-x-auto">
                      <div className="min-w-[36rem] px-4 py-1.5">
                        <div role="row" className="flex items-center gap-3 py-1.5 text-[10px] text-on-surface-variant uppercase tracking-wide">
                          <SortHeader label="Name" scope={scopeFor("storage")} sortKey="storage" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="flex-1" />
                          <SortHeader label="Type" scope={scopeFor("storage")} sortKey="type" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-16 shrink-0" />
                          <SortHeader label="Usage" scope={scopeFor("storage")} sortKey="usage" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-48 shrink-0" />
                          <SortHeader label="Free" scope={scopeFor("storage")} sortKey="avail" sort={storageSort} onSort={(key) => setStorageSort((current) => nextSort(current, key))} className="w-16 shrink-0" align="right" />
                        </div>
                        {sortedStorage.length === 0 ? (
                          <p className="text-on-surface-variant text-sm py-4 text-center">{breachOnly ? "No storage pools are breaching thresholds" : queryActive ? "No storage pools match the search" : "No storage pools on this node"}</p>
                        ) : (
                          sortedStorage.map((s) => <StorageRow key={s.storage} pool={s} thresholds={thresholds} />)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-on-surface-variant text-sm py-4 text-center">No resources on this node.</p>
          )}
        </div>
      )}
    </div>
  );
}
