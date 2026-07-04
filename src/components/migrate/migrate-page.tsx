"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { humanReadableSize as humanBytes } from "@/lib/format";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ── Types (mirror the API responses from src/lib/migrate.ts) ───────────

interface SourceInfo {
  dbPath: string;
  dbSizeBytes: number;
  present: {
    macroGroups: boolean;
    macros: boolean;
    scrapeResults: boolean;
    scrapedItems: boolean;
    scrapedItemFiles: boolean;
  };
  counts: {
    macroGroups: number;
    macros: number;
    scrapeResults: number;
    scrapedItems: number;
    scrapedItemFiles: number;
  };
  isSqlite: boolean;
}

interface TableStats {
  total: number;
  inserted: number;
  skipped: number;
}

interface MigrationResult {
  macroGroups: TableStats;
  macros: TableStats;
  scrapeResults: TableStats;
  scrapedItems: TableStats;
  scrapedItemFiles: TableStats;
}

// ── Constants ────────────────────────────────────────────────────────────

const ALL_TABLES = [
  "macroGroups",
  "macros",
  "scrapeResults",
  "scrapedItems",
  "scrapedItemFiles",
] as const;

type TableKey = (typeof ALL_TABLES)[number];

const TABLE_LABELS: Record<TableKey, { label: string; description: string }> = {
  macroGroups: {
    label: "Macro groups",
    description: "Categories in the sidebar that macros are organized into.",
  },
  macros: {
    label: "Macros",
    description: "Saved shell-command bundles (incl. run-on-agent settings).",
  },
  scrapeResults: {
    label: "Scrape results (current)",
    description:
      "The v2 scraper results table — the one the /scraper page reads from.",
  },
  scrapedItems: {
    label: "Scraped items (legacy)",
    description: "Older scraped_items rows kept for historical reference.",
  },
  scrapedItemFiles: {
    label: "Scraped item files",
    description:
      "Per-magnet file metadata attached to legacy scraped items. Skipped silently if a parent item isn't present.",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────



// ── Sub-components ───────────────────────────────────────────────────────

function PathInput({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="db-path"
        className="block text-xs font-medium text-[#849587] uppercase tracking-wider"
      >
        Source database path
      </label>
      <div className="flex gap-2">
        <input
          id="db-path"
          type="text"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-[#131313] border border-[#3B4B3F] rounded px-3 py-2 text-sm font-mono text-[#E5E2E1] outline-none focus:border-[#618B6B] placeholder:text-[#3B4B3F]"
          placeholder="/path/to/ServerTool/config.db"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="px-4 py-2 text-xs font-semibold rounded-none transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "#201F1F",
            color: "#E5E2E1",
            border: "1px solid rgba(59, 75, 63, 0.3)",
          }}
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
              Probing…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">search</span>
              Preview
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-[#3B4B3F] font-mono">
        hint: ~/ServerTool/config.db
      </p>
    </div>
  );
}

function PreviewPanel({
  info,
  onClear,
}: {
  info: SourceInfo;
  onClear: () => void;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.15)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-sm text-[#618B6B]">
            database
          </span>
          <span className="text-sm font-medium text-[#E5E2E1] truncate">
            {info.dbPath}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-[#849587] font-mono">
            {humanBytes(info.dbSizeBytes)}
          </span>
          <button
            onClick={onClear}
            className="text-[#3B4B3F] hover:text-[#849587] transition-colors"
            title="Use a different file"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
        {ALL_TABLES.map((key) => {
          const present = info.present[key];
          const count = info.counts[key];
          const { label, description } = TABLE_LABELS[key];
          return (
            <div
              key={key}
              className="flex items-center gap-3 px-3 py-2 rounded"
              style={{
                background: present ? "rgba(14, 14, 14, 0.5)" : "transparent",
                border: present
                  ? "1px solid rgba(59, 75, 63, 0.15)"
                  : "1px dashed rgba(59, 75, 63, 0.2)",
                opacity: present ? 1 : 0.5,
              }}
            >
              <span
                className="material-symbols-outlined text-base"
                style={{ color: present ? "#618B6B" : "#3B4B3F" }}
              >
                {present ? "check_circle" : "remove_circle"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#E5E2E1]">{label}</div>
                <div className="text-[11px] text-[#849587] truncate">
                  {present
                    ? `${count.toLocaleString()} ${count === 1 ? "row" : "rows"}`
                    : "not present in source"}
                </div>
              </div>
              <div
                className="text-sm font-mono tabular-nums"
                style={{ color: present ? "#E5E2E1" : "#3B4B3F" }}
              >
                {present ? count.toLocaleString() : "—"}
              </div>
            </div>
          );
        })}
      </div>
      {ALL_TABLES.every((key) => !info.present[key]) && (
        <div
          className="px-4 py-2 text-xs text-[#FFB4AB]"
          style={{ borderTop: "1px solid rgba(59, 75, 63, 0.15)" }}
        >
          None of the expected tables were found in this file. Make sure you
          pointed at the ServerTool config.db (not a sidecar file like
          .db-shm or .db-wal).
        </div>
      )}
    </div>
  );
}

function TableSelector({
  info,
  selected,
  onToggle,
}: {
  info: SourceInfo;
  selected: Record<TableKey, boolean>;
  onToggle: (key: TableKey) => void;
}) {
  const anySelected = ALL_TABLES.some((k) => selected[k]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#E5E2E1] uppercase tracking-wider">
          Tables to migrate
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => {
              for (const k of ALL_TABLES) {
                if (info.present[k] && !selected[k]) onToggle(k);
              }
            }}
            disabled={ALL_TABLES.every(
              (k) => !info.present[k] || selected[k],
            )}
            className="px-2 py-1 text-[11px] text-[#849587] hover:text-[#E5E2E1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Select all
          </button>
          <span className="text-[#3B4B3F]">·</span>
          <button
            onClick={() => {
              for (const k of ALL_TABLES) {
                if (selected[k]) onToggle(k);
              }
            }}
            disabled={!anySelected}
            className="px-2 py-1 text-[11px] text-[#849587] hover:text-[#E5E2E1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {ALL_TABLES.map((key) => {
          const present = info.present[key];
          const count = info.counts[key];
          const { label, description } = TABLE_LABELS[key];
          const checked = selected[key] && present;
          return (
            <label
              key={key}
              className={`flex items-start gap-3 p-3 rounded transition-colors ${
                present
                  ? "cursor-pointer hover:bg-[#1C1B1B]"
                  : "cursor-not-allowed opacity-50"
              }`}
              style={{
                background: "#201F1F",
                border: `1px solid ${checked ? "rgba(97, 139, 107, 0.4)" : "rgba(59, 75, 63, 0.3)"}`,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!present}
                onChange={() => onToggle(key)}
                className="mt-1 accent-[#618B6B]"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#E5E2E1]">{label}</span>
                  {present && (
                    <span className="text-xs text-[#849587] font-mono">
                      {count.toLocaleString()} {count === 1 ? "row" : "rows"}
                    </span>
                  )}
                  {!present && (
                    <span className="text-xs text-[#FFB4AB]">not present</span>
                  )}
                </div>
                <div className="text-xs text-[#849587] mt-0.5">{description}</div>
              </div>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-[#3B4B3F]">
        Migration is idempotent — running it twice will only insert rows that
        aren&apos;t already in the target DB. Already-present rows are skipped.
      </p>
    </div>
  );
}

function MigrationResultPanel({ result }: { result: MigrationResult }) {
  const totalInserted = Object.values(result).reduce(
    (a, t) => a + t.inserted,
    0,
  );
  const totalSkipped = Object.values(result).reduce(
    (a, t) => a + t.skipped,
    0,
  );
  const anyInserted = totalInserted > 0;
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: "1px solid rgba(59, 75, 63, 0.15)",
          background: anyInserted
            ? "rgba(97, 139, 107, 0.08)"
            : "rgba(255, 180, 171, 0.08)",
        }}
      >
        <span
          className="material-symbols-outlined text-sm"
          style={{ color: anyInserted ? "#618B6B" : "#FFB4AB" }}
        >
          {anyInserted ? "check_circle" : "info"}
        </span>
        <span className="text-sm font-medium text-[#E5E2E1]">
          {anyInserted
            ? `Copied ${totalInserted.toLocaleString()} ${
                totalInserted === 1 ? "row" : "rows"
              }${totalSkipped > 0 ? ` (${totalSkipped} already present)` : ""}`
            : "Nothing new to copy — every selected row was already present."}
        </span>
      </div>
      <div className="divide-y divide-[rgba(59,75,63,0.15)]">
        {ALL_TABLES.map((key) => {
          const stats = result[key];
          const { label } = TABLE_LABELS[key];
          return (
            <div
              key={key}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="material-symbols-outlined text-sm text-[#3B4B3F]">
                {stats.total === 0 ? "remove" : stats.inserted > 0 ? "arrow_forward" : "check"}
              </span>
              <span className="flex-1 text-sm text-[#E5E2E1]">{label}</span>
              <span className="text-xs text-[#849587] font-mono tabular-nums">
                {stats.total === 0
                  ? "skipped"
                  : `${stats.inserted.toLocaleString()} inserted` +
                    (stats.skipped > 0 ? `, ${stats.skipped} skipped` : "")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export function MigratePage() {
  const toast = useToast();
  const [dbPath, setDbPath] = useState("");
  const [info, setInfo] = useState<SourceInfo | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [selected, setSelected] = useState<Record<TableKey, boolean>>({
    macroGroups: false,
    macros: false,
    scrapeResults: false,
    scrapedItems: false,
    scrapedItemFiles: false,
  });
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Debounce auto-preview: when the user stops typing, fire a preview
  // if the field looks like a path.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePreview = useCallback(async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/migrate/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbPath: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInfo(null);
        setPreviewError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      const newInfo = data as SourceInfo;
      setInfo(newInfo);
      // Auto-select every present table so the user only has to
      // uncheck what they don't want.
      setSelected({
        macroGroups: newInfo.present.macroGroups,
        macros: newInfo.present.macros,
        scrapeResults: newInfo.present.scrapeResults,
        scrapedItems: newInfo.present.scrapedItems,
        scrapedItemFiles: newInfo.present.scrapedItemFiles,
      });
      // Clear any prior result — the source changed.
      setResult(null);
    } catch (e: any) {
      setInfo(null);
      setPreviewError(e?.message ?? "Failed to preview");
    } finally {
      setPreviewing(false);
    }
  }, []);

  // Auto-preview on debounced typing (only when the field looks path-like).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = dbPath.trim();
    // Only auto-preview if the path looks plausible (contains a slash
    // or ends in .db) to avoid hammering the API for partial input.
    if (trimmed && (trimmed.includes("/") || trimmed.toLowerCase().endsWith(".db"))) {
      debounceRef.current = setTimeout(() => {
        void handlePreview(trimmed);
      }, 600);
    } else {
      setInfo(null);
      setResult(null);
      setPreviewError(null);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dbPath, handlePreview]);

  const toggle = useCallback((key: TableKey) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const anySelected = ALL_TABLES.some((k) => selected[k]);

  const handleMigrate = useCallback(async () => {
    if (!info) return;
    setMigrating(true);
    try {
      const res = await fetch("/api/migrate/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbPath: info.dbPath,
          tables: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast(data?.error ?? "Migration failed", "error");
        return;
      }
      setResult(data.result as MigrationResult);
      const totalInserted = Object.values(data.result as MigrationResult).reduce(
        (a: number, t: TableStats) => a + t.inserted,
        0,
      );
      if (totalInserted > 0) {
        toast.showToast(
          `Migrated ${totalInserted} ${totalInserted === 1 ? "row" : "rows"}`,
          "success",
        );
      } else {
        toast.showToast("No new rows to migrate", "info");
      }
    } catch (e: any) {
      toast.showToast(e?.message ?? "Migration failed", "error");
    } finally {
      setMigrating(false);
    }
  }, [info, selected, toast]);

  const handleClear = useCallback(() => {
    setInfo(null);
    setResult(null);
    setPreviewError(null);
    setSelected({
      macroGroups: false,
      macros: false,
      scrapeResults: false,
      scrapedItems: false,
      scrapedItemFiles: false,
    });
  }, []);

  return (
    <div className="p-4 md:p-6 min-h-full flex flex-col gap-6 stagger-1 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold text-[#E5E2E1] tracking-tight"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          Migrate from ServerTool
        </h1>
        <p className="text-sm text-[#849587] mt-1 max-w-2xl">
          Copy your existing ServerTool SQLite database into Mission Control.
          Source rows that already exist here are skipped, so you can re-run
          this safely.
        </p>
      </div>

      {/* Path input */}
      <PathInput
        value={dbPath}
        onChange={setDbPath}
        onSubmit={() => void handlePreview(dbPath)}
        loading={previewing}
      />

      {/* Error */}
      {previewError && (
        <div
          className="rounded-lg px-4 py-3 text-sm text-[#FFB4AB] flex items-start gap-2"
          style={{
            background: "rgba(255, 180, 171, 0.08)",
            border: "1px solid rgba(255, 180, 171, 0.3)",
          }}
        >
          <span className="material-symbols-outlined text-base shrink-0 mt-0.5">
            error
          </span>
          <span className="font-mono break-all">{previewError}</span>
        </div>
      )}

      {/* Preview */}
      {info && <PreviewPanel info={info} onClear={handleClear} />}

      {/* Table selector + migrate button */}
      {info && (
        <div className="space-y-4">
          <TableSelector info={info} selected={selected} onToggle={toggle} />
          <div className="flex justify-end">
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!anySelected || migrating}
              className="px-5 py-2.5 text-sm font-semibold rounded-none transition-colors inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "#618B6B",
                color: "white",
                border: "1px solid #618B6B",
              }}
            >
              {migrating ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  Migrating…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">
                    file_upload
                  </span>
                  Migrate to Mission Control
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && <MigrationResultPanel result={result} />}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleMigrate()}
        title="Confirm migration"
        variant="primary"
        confirmLabel={migrating ? "Migrating…" : "Run migration"}
        icon="cloud_upload"
      >
        <div className="space-y-3 text-sm text-[#849587]">
          <p>
            Copy the following from{" "}
            <code className="text-[#E5E2E1] font-mono text-xs break-all">
              {info?.dbPath}
            </code>{" "}
            into the Mission Control database:
          </p>
          <ul className="space-y-1.5">
            {ALL_TABLES.filter((k) => selected[k]).map((key) => {
              const count = info?.counts[key] ?? 0;
              return (
                <li key={key} className="flex items-center gap-2 text-[#E5E2E1]">
                  <span className="material-symbols-outlined text-sm text-[#618B6B]">
                    check
                  </span>
                  <span className="flex-1">{TABLE_LABELS[key].label}</span>
                  <span className="text-xs text-[#849587] font-mono">
                    {count.toLocaleString()} {count === 1 ? "row" : "rows"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-[#3B4B3F]">
            Already-present rows will be skipped. Nothing in the source DB is
            modified. This runs as a single database transaction — if anything
            fails, no changes are written.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
