"use client";

import type { BlFinderRow as BlFinderRowType } from "./bl-finder-types";

/** A single row in the BL Finder table. */
export function BlFinderRow({
  row,
  onRecheck,
  onIgnore,
  onDelete,
}: {
  row: BlFinderRowType;
  onRecheck: (id: number) => void;
  onIgnore: (id: number) => void;
  onDelete: (row: BlFinderRowType) => void;
}) {
  const lastCheckedDisplay = row.lastChecked
    ? new Date(row.lastChecked).toLocaleString()
    : "—";

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-none"
      style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      <StatusBadge status={row.status} />

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-mono truncate"
          style={{ color: "#E5E2E1" }}
          title={row.filePath}
        >
          {row.filePath}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] mt-0.5" style={{ color: "#849587" }}>
          {row.mediaDir && <span className="font-mono">[{row.mediaDir}]</span>}
          <span>last checked: {lastCheckedDisplay}</span>
          <span>·</span>
          <span>checks: {row.checkCount}</span>
          {row.brokenCount > 0 && (
            <>
              <span>·</span>
              <span className="text-error">broken × {row.brokenCount}</span>
            </>
          )}
          {row.fileSize !== null && row.fileSize !== undefined && (
            <>
              <span>·</span>
              <span>{formatSize(row.fileSize)}</span>
            </>
          )}
        </div>
        {row.errorMessage && (
          <div
            className="text-[10px] mt-0.5 truncate font-mono"
            style={{ color: "#FFB4AB" }}
            title={row.errorMessage}
          >
            {row.errorMessage}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onRecheck(row.id)}
          className="p-1.5 rounded-none"
          style={{ background: "transparent", color: "#849587" }}
          title="Recheck now"
          aria-label="Recheck"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
        </button>
        <button
          onClick={() => onIgnore(row.id)}
          className="p-1.5 rounded-none"
          style={{ background: "transparent", color: "#849587" }}
          title={row.isIgnored ? "Un-ignore" : "Ignore"}
          aria-label="Ignore"
        >
          <span className="material-symbols-outlined text-base">
            {row.isIgnored ? "visibility" : "visibility_off"}
          </span>
        </button>
        <button
          onClick={() => onDelete(row)}
          className="p-1.5 rounded-none"
          style={{ background: "transparent", color: "#FFB4AB" }}
          title="Delete broken symlink"
          aria-label="Delete"
          disabled={row.status !== "broken"}
        >
          <span
            className="material-symbols-outlined text-base"
            style={{ opacity: row.status === "broken" ? 1 : 0.4 }}
          >
            delete
          </span>
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string; icon: string }> = {
    pending:   { bg: "rgba(132, 149, 135, 0.15)", fg: "#849587", icon: "schedule" },
    checking:  { bg: "rgba(86, 255, 167, 0.15)",   fg: "#56FFA7", icon: "progress_activity" },
    ok:        { bg: "rgba(86, 255, 167, 0.15)",   fg: "#56FFA7", icon: "check_circle" },
    broken:    { bg: "rgba(255, 180, 171, 0.15)",  fg: "#FFB4AB", icon: "broken_image" },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold rounded-none shrink-0"
      style={{ background: c.bg, color: c.fg }}
    >
      <span
        className={`material-symbols-outlined text-xs ${status === "checking" ? "animate-spin" : ""}`}
      >
        {c.icon}
      </span>
      {status}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let n = bytes;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(1)} ${units[i]}`;
}
