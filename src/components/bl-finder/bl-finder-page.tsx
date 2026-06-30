"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlFinderConfigBar } from "./bl-finder-config-bar";
import { BlFinderRow } from "./bl-finder-row";
import type {
  BlFinderConfig,
  BlFinderStatus,
  BlFinderRow as BlFinderRowType,
} from "./bl-finder-types";

/**
 * BL Finder — auto-populated list of media-file readability checks.
 *
 * The page polls /api/bl-finder (rows) and /api/bl-finder/status
 * (worker heartbeat) every 5s while visible. Config at the top bar
 * writes through to /api/bl-finder/config (PUT); the worker reads
 * the same row on its next tick, so edits take effect within
 * `intervalSec` without a restart.
 */
export function BlFinderPage() {
  const toast = useToast();

  const [rows, setRows] = useState<BlFinderRowType[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<BlFinderStatus | null>(null);
  const [config, setConfig] = useState<BlFinderConfig | null>(null);
  const [envInfo, setEnvInfo] = useState<{ mediaBasePath: string; mediaDirectories: string[] } | null>(null);
  const [mediaDirs, setMediaDirs] = useState<string[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mediaDirFilter, setMediaDirFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const [deleteCandidate, setDeleteCandidate] = useState<BlFinderRowType | null>(null);

  // ── Fetchers (ref-stable for the polling effect) ────────────────────
  const fetchRowsRef = useRef<() => Promise<void>>(async () => {});
  const fetchRows = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (mediaDirFilter) params.set("mediaDir", mediaDirFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/bl-finder?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        rows: BlFinderRowType[];
        total: number;
        counts: Record<string, number>;
      };
      setRows(data.rows);
      setTotal(data.total);
      setCounts(data.counts);
    } catch (err) {
      console.error("Failed to fetch bl-finder rows:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mediaDirFilter, search]);
  useEffect(() => { fetchRowsRef.current = fetchRows; }, [fetchRows]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bl-finder/status");
      if (!res.ok) return;
      const data = (await res.json()) as BlFinderStatus;
      setStatus(data);
    } catch { /* ignore */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/bl-finder/config");
      if (!res.ok) return;
      const data = (await res.json()) as {
        config: BlFinderConfig;
        defaults: BlFinderConfig;
        env: { mediaBasePath: string; mediaDirectories: string[] };
      };
      setConfig(data.config);
      setEnvInfo(data.env);
    } catch { /* ignore */ }
  }, []);

  // Derive the media-dir filter list from the row set so the dropdown
  // reflects what's actually in the DB.
  useEffect(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.mediaDir) set.add(r.mediaDir);
    setMediaDirs(Array.from(set).sort());
  }, [rows]);

  // ── Initial load ────────────────────────────────────────────────────
  useEffect(() => {
    void fetchRows();
    void fetchStatus();
    void fetchConfig();
  }, [fetchRows, fetchStatus, fetchConfig]);

  // ── Re-fetch rows when filters change ───────────────────────────────
  useEffect(() => {
    void fetchRowsRef.current();
  }, [statusFilter, mediaDirFilter, search]);

  // ── Polling (rows every 5s, status every 3s) ────────────────────────
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      await Promise.all([fetchRowsRef.current(), fetchStatus()]);
    };
    const rowsId = setInterval(() => { void tick(); }, 5000);
    const onVis = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(rowsId);
      document.removeEventListener("visibilitychange", onVis);
      void cancelled;
    };
  }, [fetchStatus]);

  // ── Actions ─────────────────────────────────────────────────────────
  const recheckAll = useCallback(async () => {
    try {
      const res = await fetch("/api/bl-finder/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mediaDirFilter ? { mediaDir: mediaDirFilter } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { updated: number };
      toast.showToast(`Recheck queued for ${data.updated} file(s)`, "success");
      await fetchRows();
    } catch (err) {
      toast.showToast("Failed to queue recheck", "error");
    }
  }, [mediaDirFilter, toast, fetchRows]);

  const triggerScan = useCallback(async () => {
    try {
      const res = await fetch("/api/bl-finder/trigger-scan", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { updated: number };
      toast.showToast(`Discovery queued for ${data.updated} file(s)`, "success");
      await fetchRows();
    } catch (err) {
      toast.showToast("Failed to trigger scan", "error");
    }
  }, [toast, fetchRows]);

  const recheckOne = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/bl-finder/recheck/${id}`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.showToast("Rechecked", "success");
      await fetchRows();
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : "Recheck failed",
        "error",
      );
    }
  }, [toast, fetchRows]);

  const ignoreOne = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/bl-finder/ignore/${id}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { isIgnored: boolean };
      toast.showToast(data.isIgnored ? "Ignored" : "Un-ignored", "success");
      await fetchRows();
    } catch (err) {
      toast.showToast("Failed to toggle ignore", "error");
    }
  }, [toast, fetchRows]);

  const deleteOne = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/bl-finder/delete/${id}`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.showToast("Deleted", "success");
      setDeleteCandidate(null);
      await fetchRows();
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : "Delete failed",
        "error",
      );
    }
  }, [toast, fetchRows]);

  // ── Derived ─────────────────────────────────────────────────────────
  const lastPassDisplay = useMemo(() => {
    if (!status?.lastPassAt) return "never";
    const ms = Date.now() - status.lastPassAt;
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    return `${Math.floor(ms / 3_600_000)}h ago`;
  }, [status?.lastPassAt]);

  /**
   * Effective media dirs — the override from config if non-empty,
   * otherwise the env-var defaults from AppConfig.
   */
  const effectiveMediaDirs = useMemo(() => {
    if (config?.mediaDirs && config.mediaDirs.length > 0) return config.mediaDirs;
    if (envInfo) return envInfo.mediaDirectories;
    return [];
  }, [config?.mediaDirs, envInfo]);

  /** True if the resolved directories come from env rather than config override. */
  const usingEnvDirs = useMemo(() => {
    return (!config?.mediaDirs || config.mediaDirs.length === 0) && !!envInfo;
  }, [config?.mediaDirs, envInfo]);

  return (
    <div
      className="max-w-[1400px] mx-auto relative flex flex-col h-full overflow-y-auto"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="pt-5 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-4 px-4">
          <div>
            <h1
              className="text-2xl font-bold tracking-tight text-[#E5E2E1]"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              BL Finder
            </h1>
            <p className="text-xs italic mt-1" style={{ color: "#849587" }}>
              Media file readability checks. Configured at the top; the worker runs in the background.
            </p>
          </div>
        </div>

        {/* ── Status bar ────────────────────────────────────────── */}
        {status && config && envInfo && (
          <div
            className="flex flex-wrap items-start gap-x-6 gap-y-1 px-4 py-2 mb-3 text-[11px] font-mono"
            style={{
              background: "#1A1919",
              border: "1px solid rgba(59, 75, 63, 0.3)",
              color: "#849587",
            }}
          >
            {/* Worker state */}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {status.running ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#56FFA7] animate-pulse" />
                  <span style={{ color: "#56FFA7" }}>Checking…</span>
                </>
              ) : config.enabled ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#56FFA7]" />
                  <span style={{ color: "#56FFA7" }}>Enabled</span>
                  <span className="text-[10px]">(idle)</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#6B5B5B" }} />
                  <span style={{ color: "#6B5B5B" }}>Disabled</span>
                </>
              )}
            </span>

            {/* Media root */}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="material-symbols-outlined text-[12px]">folder</span>
              <span>{envInfo.mediaBasePath}</span>
              <span style={{ color: effectiveMediaDirs.length > 3 ? "#E5E2E1" : undefined }}>
                {'{'}{effectiveMediaDirs.join(", ")}{'}'}
              </span>
              {usingEnvDirs && (
                <span
                  className="text-[10px] italic ml-1"
                  style={{ color: "rgba(255, 180, 171, 0.7)" }}
                  title="No media dirs configured in the config bar — using env MEDIA_DIRECTORIES"
                >
                  (env)
                </span>
              )}
            </span>

            {/* DB totals */}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="material-symbols-outlined text-[12px]">database</span>
              <span>{total.toLocaleString()} total</span>
              {counts.broken > 0 && (
                <span style={{ color: "#FFB4AB" }}>
                  · {counts.broken.toLocaleString()} broken
                </span>
              )}
              {counts.pending > 0 && (
                <span>
                  · {counts.pending.toLocaleString()} pending
                </span>
              )}
              {counts.ok > 0 && (
                <span style={{ color: "rgba(86, 255, 167, 0.7)" }}>
                  · {counts.ok.toLocaleString()} ok
                </span>
              )}
            </span>

            {/* Last pass */}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="material-symbols-outlined text-[12px]">schedule</span>
              <span>pass: {lastPassDisplay}</span>
              {status.processed > 0 && (
                <span>
                  · {status.ok} ok / {status.broken} broken
                </span>
              )}
            </span>

            {/* Error if any */}
            {status.error && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: "#FFB4AB" }}>
                <span className="material-symbols-outlined text-[12px]">error</span>
                <span>{status.error}</span>
              </span>
            )}
          </div>
        )}

        {/* ── Config bar ────────────────────────────────────────── */}
        {config && (
          <BlFinderConfigBar
            config={config}
            onSaved={(c) => setConfig(c)}
          />
        )}

        {/* ── Filters + actions ─────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center gap-2 px-4 pb-3"
          style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-none"
            style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="checking">Checking</option>
            <option value="ok">OK</option>
            <option value="broken">Broken</option>
          </select>
          <select
            value={mediaDirFilter}
            onChange={(e) => setMediaDirFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-none"
            style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            <option value="">All media dirs</option>
            {mediaDirs.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput);
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search path…"
              className="px-2 py-1.5 text-xs rounded-none w-48"
              style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
            />
          </form>

          <div className="flex-1" />

          {/* Status counts */}
          {(["pending", "checking", "ok", "broken"] as const).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded-none"
              style={{
                background: "#201F1F",
                color: statusFilter === s ? "#E5E2E1" : "#849587",
                border: "1px solid rgba(59, 75, 63, 0.3)",
              }}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              role="button"
            >
              {s}: {counts[s] ?? 0}
            </span>
          ))}

          <button
            onClick={() => void triggerScan()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-none"
            style={{
              background: "#201F1F",
              color: "#E5E2E1",
              border: "1px solid rgba(59, 75, 63, 0.3)",
            }}
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Discover
          </button>
          <button
            onClick={() => void recheckAll()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-none"
            style={{
              background: "linear-gradient(135deg, #56FFA7, #00FF9C)",
              color: "#002110",
            }}
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Recheck all
          </button>
        </div>
      </div>

      {/* ── Rows ──────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        {loading ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 italic" style={{ color: "#849587" }}>
            {statusFilter || mediaDirFilter || search
              ? "No files match the current filters."
              : "No files yet. Click 'Discover' to walk the media dirs, or wait for the next worker tick."}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <BlFinderRow
                key={r.id}
                row={r}
                onRecheck={(id) => void recheckOne(id)}
                onIgnore={(id) => void ignoreOne(id)}
                onDelete={(row) => setDeleteCandidate(row)}
              />
            ))}
          </div>
        )}
        {total > rows.length && (
          <p className="text-center text-xs italic mt-4" style={{ color: "#849587" }}>
            Showing {rows.length} of {total}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleteCandidate !== null}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={() => { if (deleteCandidate) void deleteOne(deleteCandidate.id); }}
        title="Delete broken symlink?"
        icon="delete"
        confirmLabel="Delete"
        variant="danger"
      >
        <div className="space-y-2 text-sm text-on-surface-variant">
          <p>
            This will remove the symlink on disk and the row from the
            database. The target file (on the webdav / rclone mount) will
            <strong> not</strong> be touched.
          </p>
          {deleteCandidate && (
            <pre
              className="text-[11px] font-mono p-2 rounded-none overflow-x-auto"
              style={{ background: "#1A1919", color: "#FFB4AB" }}
            >
              {deleteCandidate.filePath}
            </pre>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
