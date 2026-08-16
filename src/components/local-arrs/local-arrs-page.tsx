"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { humanReadableSize } from "@/lib/format";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LOCAL_ARRS, type LocalArrItem, type LocalArrLibrary, type LocalArrSlug } from "@/lib/local-arrs";

const STORAGE_KEY = "mission-control:local-arrs:v1";
type SortKey = "size" | "name";
type SortDirection = "asc" | "desc";

function readPreferences(): { instance: LocalArrSlug; showEmpty: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<{
      instance: LocalArrSlug;
      showEmpty: boolean;
    }> | null;
    return {
      instance: value?.instance === "radarrlocal" ? "radarrlocal" : "sonarrlocal",
      showEmpty: value?.showEmpty === true,
    };
  } catch {
    return { instance: "sonarrlocal", showEmpty: false };
  }
}

function sortItems(items: LocalArrItem[], key: SortKey, direction: SortDirection) {
  return [...items].sort((a, b) => {
    const comparison = key === "size"
      ? a.sizeOnDisk - b.sizeOnDisk
      : a.title.localeCompare(b.title);
    return direction === "asc" ? comparison : -comparison;
  });
}

export function LocalArrsPage() {
  const [instance, setInstance] = useState<LocalArrSlug>("sonarrlocal");
  const [showEmpty, setShowEmpty] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [library, setLibrary] = useState<LocalArrLibrary | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<{ itemId: number; kind: "delete-files" | "delete-series" | "monitor-future" } | null>(null);
  const [confirm, setConfirm] = useState<{ item: LocalArrItem; kind: "delete-files" | "delete-series" | "monitor-future" } | null>(null);
  const selected = LOCAL_ARRS[instance];

  useEffect(() => {
    const preferences = readPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted UI preferences once on mount
    setInstance(preferences.instance);
    setShowEmpty(preferences.showEmpty);
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ instance, showEmpty }));
    } catch {
      // Visual preferences still work when storage is unavailable.
    }
  }, [instance, showEmpty, preferencesReady]);

  const fetchLibrary = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setLibrary(null);

    try {
      const response = await fetch(`/api/local-arrs/library?instance=${instance}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      if (id === requestId.current) setLibrary(body as LocalArrLibrary);
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : "Failed to load library");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [instance]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch callback synchronizes network state
    if (preferencesReady) fetchLibrary();
  }, [fetchLibrary, preferencesReady]);

  const handleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "size" ? "desc" : "asc");
    }
  };

  /** Run one of the three Sonarr actions against a series, optimistically updating the row. */
  const runAction = useCallback(
    async (item: LocalArrItem, kind: "delete-files" | "delete-series" | "monitor-future") => {
      if (pendingAction) return;
      setPendingAction({ itemId: item.id, kind });
      const base = `/api/local-arrs/series/${item.id}`;
      const query = `?instance=${instance}`;
      try {
        if (kind === "delete-files") {
          const res = await fetch(`${base}/delete-files${query}`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          const deleted = (body as { deleted?: number }).deleted ?? 0;
          setLibrary((current) =>
            current ? { ...current, items: current.items.map((row) => (row.id === item.id ? { ...row, sizeOnDisk: 0, fileCount: 0 } : row)) } : current
          );
          toast.showToast(`Deleted ${deleted} episode file${deleted === 1 ? "" : "s"} from \u201C${item.title}\u201D.`, "success");
          if (deleted > 0) {
            toast.showToast(`Tip: set \u201C${item.title}\u201D to Future to stop it re-grabbing the deleted episodes.`, "info");
          }
        } else if (kind === "delete-series") {
          const res = await fetch(`${base}${query}`, { method: "DELETE" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          setLibrary((current) =>
            current ? { ...current, items: current.items.filter((row) => row.id !== item.id), totalItems: current.totalItems - 1 } : current
          );
          toast.showToast(`Removed \u201C${item.title}\u201D and its files from ${selected.label}.`, "success");
        } else {
          const res = await fetch(`${base}/monitor${query}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ monitor: "future" }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          toast.showToast(`\u201C${item.title}\u201D now tracks future episodes only.`, "success");
        }
      } catch (err) {
        toast.showToast(err instanceof Error ? err.message : "Action failed", "error");
      } finally {
        setPendingAction(null);
      }
    },
    [instance, pendingAction, selected.label, toast]
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const items = (library?.items ?? []).filter((item) => {
      if (!showEmpty && item.fileCount === 0) return false;
      return !normalizedQuery || item.title.toLocaleLowerCase().includes(normalizedQuery);
    });
    return sortItems(items, sortKey, sortDirection);
  }, [library, query, showEmpty, sortKey, sortDirection]);

  return (
    <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-display text-on-surface">Local Arrs</h1>
          <p className="text-sm text-on-surface-variant mt-1">Browse local Sonarr and Radarr libraries by disk usage.</p>
        </div>
        <button
          type="button"
          onClick={fetchLibrary}
          disabled={loading || !preferencesReady}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-50 transition-colors"
        >
          <span aria-hidden="true" className={`material-symbols-outlined text-sm ${loading ? "animate-spin" : ""}`}>refresh</span>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-5 shrink-0">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <span className="sr-only">Local Arr instance</span>
          <select
            value={instance}
            onChange={(event) => setInstance(event.target.value as LocalArrSlug)}
            className="px-3 py-2 rounded-[var(--radius-button)] bg-surface-container border border-outline-variant/40 text-on-surface text-sm outline-none focus:border-primary"
          >
            <option value="sonarrlocal">Sonarr Local</option>
            <option value="radarrlocal">Radarr Local</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(event) => setShowEmpty(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show Empty Shows
        </label>

        <label className="xl:ml-auto flex items-center gap-2">
          <span className="sr-only">Filter {selected.itemLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${selected.itemLabel}…`}
            className="w-full sm:w-64 px-3 py-2 rounded-[var(--radius-button)] bg-bg border border-outline-variant/40 text-on-surface text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      {library && !error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 shrink-0">
          <p className="text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">{library.totalItems.toLocaleString()}</span> {library.itemLabel}
            <span className="mx-2 text-on-surface-variant/50">•</span>
            <span className="font-semibold text-on-surface">{humanReadableSize(library.totalSize)}</span> total
          </p>
          <p className="text-xs text-on-surface-variant/70">
            Showing {visibleItems.length.toLocaleString()} of {library.totalItems.toLocaleString()}
          </p>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant animate-pulse">
          Loading {selected.label}…
        </div>
      )}

      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-6">
          <span className="material-symbols-outlined text-5xl text-error/80">cloud_off</span>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Unable to load {selected.label}</h2>
            <p className="text-sm text-on-surface-variant mt-1 max-w-md">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchLibrary}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] bg-primary text-on-primary hover:bg-primary-dim transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">refresh</span>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && library && (
        <div className="flex-1 min-h-0 overflow-auto rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-lowest/40">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface border-b border-outline-variant/30">
              <tr>
                <th className="px-4 py-3 font-semibold text-on-surface-variant">
                  <button type="button" onClick={() => handleSort("name")} className="hover:text-on-surface transition-colors" aria-label="Sort by name">
                    Name {sortKey === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold text-on-surface-variant whitespace-nowrap">
                  <button type="button" onClick={() => handleSort("size")} className="hover:text-on-surface transition-colors" aria-label="Sort by size">
                    Size {sortKey === "size" && (sortDirection === "asc" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold text-on-surface-variant whitespace-nowrap">Files on disk</th>
                {instance === "sonarrlocal" && (
                  <th className="px-4 py-3 text-right font-semibold text-on-surface-variant">Actions</th>
                )}
                <th className="px-4 py-3 text-right font-semibold text-on-surface-variant">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {visibleItems.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container/40 transition-colors">
                  <td className="px-4 py-3 text-on-surface font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-on-surface-variant font-mono whitespace-nowrap">{humanReadableSize(item.sizeOnDisk)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{item.fileCount.toLocaleString()}</td>
                  {instance === "sonarrlocal" && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirm({ item, kind: "delete-files" })}
                          disabled={pendingAction !== null}
                          title="Delete all episode files on disk (keep the series)"
                          aria-label={`Delete all files on disk for ${item.title}`}
                          className="inline-flex items-center justify-center size-8 rounded-[var(--radius-button)] text-error/80 hover:bg-error/10 hover:text-error disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-lg">{pendingAction?.itemId === item.id && pendingAction.kind === "delete-files" ? "progress_activity" : "delete"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ item, kind: "delete-series" })}
                          disabled={pendingAction !== null}
                          title="Delete the series AND all its files (removes the show from Sonarr)"
                          aria-label={`Delete series and files for ${item.title}`}
                          className="inline-flex items-center justify-center size-8 rounded-[var(--radius-button)] text-error/80 hover:bg-error/10 hover:text-error disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-lg">{pendingAction?.itemId === item.id && pendingAction.kind === "delete-series" ? "progress_activity" : "delete_forever"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ item, kind: "monitor-future" })}
                          disabled={pendingAction !== null}
                          title="Set monitoring to future episodes only"
                          aria-label={`Set ${item.title} monitoring to future episodes`}
                          className="inline-flex items-center justify-center size-8 rounded-[var(--radius-button)] text-primary/80 hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-lg">{pendingAction?.itemId === item.id && pendingAction.kind === "monitor-future" ? "progress_activity" : "event_upcoming"}</span>
                        </button>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.title} in ${library.label}`}
                      className="inline-flex items-center text-primary hover:text-primary-fixed transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">open_in_new</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleItems.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-on-surface-variant">
              No {library.itemLabel} match the current filters.
            </div>
          )}
        </div>
      )}

      {/* ── Confirm dialogs (Sonarr actions) ─────────────────────────────────── */}
      <ConfirmDialog
        open={confirm?.kind === "delete-files"}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) void runAction(confirm.item, "delete-files"); }}
        title="Delete episode files?"
        confirmLabel="Delete files"
        variant="danger"
      >
        {confirm && (
          <p className="text-sm text-on-surface-variant">
            Delete all {confirm.item.fileCount.toLocaleString()} episode file{confirm.item.fileCount === 1 ? "" : "s"}
            ({humanReadableSize(confirm.item.sizeOnDisk)}) for <span className="font-semibold text-on-surface">{confirm.item.title}</span>?
            The series stays in Sonarr and its monitoring is unchanged — still-monitored episodes may be re-grabbed.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "delete-series"}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) void runAction(confirm.item, "delete-series"); }}
        title="Delete series and files?"
        icon="delete_forever"
        confirmLabel="Delete series + files"
        variant="danger"
      >
        {confirm && (
          <p className="text-sm text-on-surface-variant">
            This removes <span className="font-semibold text-on-surface">{confirm.item.title}</span> from Sonarr
            <span className="font-semibold"> and </span> deletes its {confirm.item.fileCount.toLocaleString()} file
            {confirm.item.fileCount === 1 ? "" : "s"} ({humanReadableSize(confirm.item.sizeOnDisk)}). The show must be
            re-added to track again. This cannot be undone.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "monitor-future"}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) void runAction(confirm.item, "monitor-future"); }}
        title="Track future episodes?"
        icon="event_upcoming"
        confirmLabel="Set future"
        variant="primary"
      >
        {confirm && (
          <p className="text-sm text-on-surface-variant">
            Switch <span className="font-semibold text-on-surface">{confirm.item.title}</span> to monitoring future
            episodes only? Episodes that have already aired with no file will be unmonitored; ones already aired with a
            file are kept.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
