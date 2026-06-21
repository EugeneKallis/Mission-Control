"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import type { FileTreeItem } from "@/types";

type Source = "nzb" | "debrid";

interface FileTreeViewerProps {
  source: Source;
}

// Depth inferred from path length: every path segment adds 1 level of depth.
// For paths under the media base (e.g. "/movies/foo"), the leading slash doesn't
// count — we use the number of non-empty segments after the first slash.
function depthFromPath(path: string, parent: string): number {
  if (!path) return 0;
  // The depth is the count of segments from the parent path downward.
  // Parent "" means root — depth of /foo is 1, /foo/bar is 2.
  const full = path.split("/").filter(Boolean);
  if (parent === "") return full.length === 0 ? 0 : 1;
  const parentSegs = parent.split("/").filter(Boolean);
  return Math.max(0, full.length - parentSegs.length);
}

export function FileTreeViewer({ source }: FileTreeViewerProps) {
  const toast = useToast();
  const title = source === "nzb" ? "NZB Viewer" : "Debrid Viewer";

  // ── Tree state ────────────────────────────────────────────────────────
  const [childrenByParent, setChildrenByParent] = useState<
    Record<string, FileTreeItem[]>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingParent, setLoadingParent] = useState<string | null>(null);
  const [arrMap, setArrMap] = useState<Record<string, string>>({});

  // ── Search state ──────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileTreeItem[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Delete flow state ─────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs for debounce timers
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load: root + Arr map ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [treeRes, arrRes] = await Promise.all([
          fetch(`/api/${source}/tree?parent=`),
          fetch("/api/arr/instance-map").catch(() => null),
        ]);
        if (cancelled) return;
        if (treeRes.ok) {
          const items: FileTreeItem[] = await treeRes.json();
          setChildrenByParent({ "": items });
        } else {
          toast?.showToast(`Failed to load ${source} files`, "error");
        }
        if (arrRes && arrRes.ok) {
          const map = await arrRes.json();
          setArrMap(map);
        }
      } catch (err) {
        console.error("Initial load error:", err);
        toast?.showToast(`Failed to load ${source} files`, "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, toast]);

  // ── Search debounce (300ms) ───────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const trimmed = searchInput.trim();
    if (trimmed === "") {
      setSearchQuery("");
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/${source}/search?q=${encodeURIComponent(trimmed)}`
        );
        if (res.ok) {
          const results: FileTreeItem[] = await res.json();
          setSearchQuery(trimmed);
          setSearchResults(results);
        } else {
          toast?.showToast("Search failed", "error");
        }
      } catch (err) {
        console.error("Search error:", err);
        toast?.showToast("Search failed", "error");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput, source, toast]);

  // ── Lazy expand dir ───────────────────────────────────────────────────
  const expandDir = useCallback(
    async (parentPath: string) => {
      if (childrenByParent[parentPath] !== undefined) {
        // Already loaded — just toggle expanded.
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(parentPath)) next.delete(parentPath);
          else next.add(parentPath);
          return next;
        });
        return;
      }
      setLoadingParent(parentPath);
      try {
        const res = await fetch(
          `/api/${source}/tree?parent=${encodeURIComponent(parentPath)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items: FileTreeItem[] = await res.json();
        setChildrenByParent((prev) => ({ ...prev, [parentPath]: items }));
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentPath);
          return next;
        });
      } catch (err) {
        console.error("Expand dir error:", err);
        toast?.showToast("Failed to load directory", "error");
      } finally {
        setLoadingParent(null);
      }
    },
    [childrenByParent, source, toast]
  );

  // ── Selection ─────────────────────────────────────────────────────────
  const toggleSelect = useCallback((item: FileTreeItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (items: FileTreeItem[]) => {
      const allSelected = items.every((it) => selected.has(it.path));
      setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          for (const it of items) next.delete(it.path);
        } else {
          for (const it of items) next.add(it.path);
        }
        return next;
      });
    },
    [selected]
  );

  // ── Collapse / Expand all (operates on loaded rows) ──────────────────
  const collapseAll = () => setExpanded(new Set());
  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      // Expand every loaded directory.
      for (const [parent, kids] of Object.entries(childrenByParent)) {
        if (kids.some((k) => k.is_dir)) next.add(parent);
      }
      return next;
    });
  }, [childrenByParent]);

  // ── Reload root after delete ──────────────────────────────────────────
  const reloadRoot = useCallback(async () => {
    try {
      const res = await fetch(`/api/${source}/tree?parent=`);
      if (res.ok) {
        const items: FileTreeItem[] = await res.json();
        setChildrenByParent((prev) => ({ ...prev, "": items }));
      }
    } catch (err) {
      console.error("Reload root error:", err);
    }
  }, [source]);

  // ── Delete submit ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/${source}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [...selected] }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      toast?.showToast(
        `Deleted ${result.deleted ?? selected.size} item(s)`,
        "success"
      );
      setSelected(new Set());
      setConfirmOpen(false);
      // Clear cache and reload root — children may now be stale.
      setChildrenByParent({ "": [] });
      setExpanded(new Set());
      await reloadRoot();
    } catch (err) {
      console.error("Delete error:", err);
      toast?.showToast(
        err instanceof Error ? err.message : "Delete failed",
        "error"
      );
    } finally {
      setDeleting(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────
  const isSearching = searchQuery !== "";

  // Flatten the currently-visible tree (respecting expanded state) into a
  // linear list of rows with computed depth.
  type Row = { item: FileTreeItem; depth: number };

  const visibleRows = useMemo<Row[]>(() => {
    if (isSearching) {
      return searchResults.map((it) => ({
        item: it,
        depth: depthFromPath(it.path, it.parent_path),
      }));
    }
    const rows: Row[] = [];
    const visit = (parent: string, depth: number) => {
      const items = childrenByParent[parent] ?? [];
      for (const it of items) {
        rows.push({ item: it, depth });
        if (it.is_dir && expanded.has(it.path)) {
          visit(it.path, depth + 1);
        }
      }
    };
    visit("", 0);
    return rows;
  }, [isSearching, searchResults, childrenByParent, expanded]);

  // Roots for the "select all" header (search results, or root when not searching).
  const headerItems = useMemo<FileTreeItem[]>(() => {
    if (isSearching) return searchResults;
    return childrenByParent[""] ?? [];
  }, [isSearching, searchResults, childrenByParent]);

  const allHeaderSelected =
    headerItems.length > 0 && headerItems.every((it) => selected.has(it.path));

  // For the confirm modal, display the selected paths with file counts.
  const selectedDetails = useMemo(() => {
    const set = new Set(selected);
    const rows: Array<{ path: string; name: string; isDir: boolean; count: number }> = [];
    // Look up selected items in the loaded tree; fall back to "unknown" otherwise.
    for (const path of set) {
      // Find item in childrenByParent.
      let found: FileTreeItem | undefined;
      for (const kids of Object.values(childrenByParent)) {
        const m = kids.find((k) => k.path === path);
        if (m) {
          found = m;
          break;
        }
      }
      // Also check search results.
      if (!found) {
        found = searchResults.find((k) => k.path === path);
      }
      const name = path.split("/").filter(Boolean).pop() ?? path;
      rows.push({
        path,
        name,
        isDir: found?.is_dir ?? false,
        count: found?.file_count ?? 0,
      });
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path));
  }, [selected, childrenByParent, searchResults]);

  return (
    <div className="p-4 md:p-6 stagger-1 flex flex-col gap-5 h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
        <h1 className="text-2xl font-bold text-on-surface tracking-tight font-display">
          {title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={collapseAll} variant="ghost">
            <span className="material-symbols-outlined text-base">unfold_less</span>
            Collapse All
          </Button>
          <Button onClick={expandAll} variant="ghost">
            <span className="material-symbols-outlined text-base">unfold_more</span>
            Expand All
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            variant="danger"
            disabled={selected.size === 0}
          >
            <span className="material-symbols-outlined text-base">delete</span>
            Delete Selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0">
        <TextInput
          type="search"
          placeholder="Filter files…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {isSearching && (
          <div className="mt-2 flex items-center gap-3 text-xs text-on-surface-variant">
            <span>
              Search results for &ldquo;{searchQuery}&rdquo; — {searchResults.length} match
              {searchResults.length === 1 ? "" : "es"}
            </span>
            <button
              className="font-semibold text-primary hover:underline"
              onClick={() => setSearchInput("")}
            >
              Clear
            </button>
          </div>
        )}
        {searching && (
          <div className="mt-1 text-[11px] text-on-surface-variant italic">Searching…</div>
        )}
      </div>

      {/* Table */}
      <div
        className="flex-1 min-h-0 overflow-auto rounded-none"
        style={{ border: "1px solid rgba(59, 75, 63, 0.3)" }}
      >
        <table className="w-full text-left text-sm">
          <thead
            className="text-[11px] uppercase font-semibold tracking-wider"
            style={{
              background: "#1C1B1B",
              color: "#849587",
              borderBottom: "1px solid rgba(59, 75, 63, 0.3)",
            }}
          >
            <tr>
              <th className="px-5 py-3.5 w-12">
                <input
                  type="checkbox"
                  checked={allHeaderSelected}
                  onChange={() => toggleSelectAll(headerItems)}
                  className="rounded-none border-outline-variant bg-surface-container-high accent-primary cursor-pointer"
                  aria-label="Select all"
                />
              </th>
              <th className="px-5 py-3.5 text-left">Name</th>
            </tr>
          </thead>
          <tbody style={{ background: "#0E0E0E" }}>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-5 py-10 text-center text-on-surface-variant text-sm italic"
                >
                  {isSearching
                    ? `No ${source.toUpperCase()} files match "${searchQuery}".`
                    : `No ${source.toUpperCase()} files found.`}
                </td>
              </tr>
            ) : (
              visibleRows.map(({ item, depth }) => {
                const isExpanded = expanded.has(item.path);
                const isLoading = loadingParent === item.path;
                const isChecked = selected.has(item.path);
                const arrUrl = arrMap[item.name];
                return (
                  <tr
                    key={item.path}
                    data-path={item.path}
                    className="hover:bg-surface-container transition-colors"
                    style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.15)" }}
                  >
                    <td className="px-5 py-2.5 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(item)}
                        className="rounded-none border-outline-variant bg-surface-container-high accent-primary cursor-pointer"
                        aria-label={`Select ${item.name}`}
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <div
                        style={{ paddingLeft: `${depth * 20}px` }}
                        className="flex items-center gap-2.5"
                      >
                        {item.is_dir ? (
                          <>
                            <button
                              type="button"
                              onClick={() => expandDir(item.path)}
                              className="p-1 hover:bg-surface-container-high rounded-none transition-colors"
                              aria-label={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isLoading ? (
                                <span className="material-symbols-outlined text-primary text-lg animate-spin">
                                  progress_activity
                                </span>
                              ) : (
                                <span
                                  className={`material-symbols-outlined text-primary text-lg transition-transform ${
                                    isExpanded ? "rotate-90" : ""
                                  }`}
                                >
                                  chevron_right
                                </span>
                              )}
                            </button>
                            <span className="material-symbols-outlined text-on-surface-variant text-lg">
                              folder
                            </span>
                            <span
                              onClick={() => expandDir(item.path)}
                              className="font-semibold cursor-pointer transition-colors text-sm text-on-surface hover:text-primary"
                            >
                              {item.name}
                            </span>
                            {arrUrl && (
                              <a
                                href={arrUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-on-surface-variant hover:text-primary transition-colors ml-1"
                                title={`Open ${item.name} in Arr`}
                              >
                                <span className="material-symbols-outlined text-sm">
                                  open_in_new
                                </span>
                              </a>
                            )}
                            {item.file_count != null && item.file_count > 0 && (
                              <span
                                className="text-[11px] text-on-surface-variant ml-1.5 px-2 py-0.5 font-medium rounded-none"
                                style={{ background: "#2A2A2A" }}
                              >
                                {item.file_count}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="w-6 h-6" />
                            <span className="material-symbols-outlined text-on-surface-variant text-lg">
                              description
                            </span>
                            <span className="font-mono text-xs break-all text-on-surface">
                              {item.name}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirm modal */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`}
        icon="delete"
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
      >
        <div className="text-sm text-on-surface-variant mb-3">
          This will remove the file{selected.size === 1 ? "" : "s"} from disk and the
          database. This action cannot be undone.
        </div>
        <div
          className="max-h-64 overflow-y-auto rounded-none p-3 font-mono text-xs"
          style={{ background: "#0E0E0E", border: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          {selectedDetails.map((d) => (
            <div
              key={d.path}
              className="flex items-center gap-2 py-1 text-on-surface"
            >
              <span className="material-symbols-outlined text-base text-on-surface-variant">
                {d.isDir ? "folder" : "description"}
              </span>
              <span className="truncate flex-1">{d.path}</span>
              {d.isDir && d.count > 0 && (
                <span className="text-on-surface-variant text-[10px]">
                  ({d.count} file{d.count === 1 ? "" : "s"})
                </span>
              )}
            </div>
          ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}
