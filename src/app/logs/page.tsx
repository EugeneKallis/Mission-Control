"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/toast-provider";
import { isErrorLine } from "@/lib/log-alerts";

const LABELS: Record<string, string> = {
  web: "Web",
  "magnet-bridge": "Magnet Bridge",
  "broken-link-checker": "BL Finder",
  scraper: "Scraper",
  "agent-tasks": "Agent Tasks",
};

const SERVICES = Object.keys(LABELS);

/** UI status strings that should never be filtered or replaced by the empty-state message. */
function isPlaceholder(s: string): boolean {
  if (s === "Loading...") return true;
  if (s === "No logs available.") return true;
  if (s.startsWith("Failed to fetch logs")) return true;
  return false;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<string>("Loading...");
  const [service, setService] = useState("web");
  const [filter, setFilter] = useState("");
  const [excludeWeb, setExcludeWeb] = useState(true);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [errorCount, setErrorCount] = useState(0);
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const terminalRef = useRef<HTMLPreElement>(null);
  const toast = useToast();
  const userScrolledRef = useRef(false);
  const prevLogsRef = useRef<string>("");

  const fetchLogs = useCallback(async (svc: string, isPoll = false) => {
    try {
      const params = new URLSearchParams({ service: svc });
      if (isPoll) {
        params.set("lines", "100");
      } else {
        params.set("lines", "all");
      }
      const res = await fetch(`/api/logs?${params}`);
      const text = await res.text();

      setLogs((prev) => {
        if (isPoll && prev !== "Loading..." && prev !== "No logs available." && !prev.startsWith("Failed")) {
          // Find overlap to append only new lines
          const prevLines = prev.split("\n");
          const newLines = text.split("\n");
          // Take the tail of prev as overlap anchor (last 5 lines)
          const anchor = prevLines.slice(-5).join("\n");
          const anchorIdx = newLines.join("\n").lastIndexOf(anchor);
          if (anchorIdx >= 0) {
            const appended = newLines.join("\n").slice(anchorIdx + anchor.length);
            if (appended) {
              return prev + appended;
            }
            return prev;
          }
          // No overlap found, use new data
          return text;
        }
        return text || "No logs available.";
      });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      if (!isPoll) setLogs("Failed to fetch logs. The journalctl endpoint may not be available on this system.");
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs(service, false);
  }, [service, fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(service, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, service, fetchLogs]);

  // ── Fetch alert counts (poll every 30s) ──────────────────────
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/logs/alerts");
      const data = await res.json();
      setErrorCount(data.total ?? 0);
      setAcknowledgedAt(data.acknowledgedAt ?? null);
    } catch { /* leave previous values */ }
  }, []);

  useEffect(() => {
    void fetchAlerts();
    const interval = setInterval(() => { void fetchAlerts(); }, 30_000);
    const onVis = () => { if (!document.hidden) void fetchAlerts(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchAlerts]);

  // Track scroll position
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      userScrolledRef.current = !isAtBottom;
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when logs update (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = isPlaceholder(logs)
    ? logs
    : logs
        .split("\n")
        .filter((line) => {
          if (errorsOnly && !isErrorLine(line)) {
            return false;
          }
          if (excludeWeb && (line.startsWith("GET ") || line.startsWith("POST ") || line.startsWith('"GET ') || line.startsWith('"POST '))) {
            return false;
          }
          if (filter && !line.toLowerCase().includes(filter.toLowerCase())) {
            return false;
          }
          return true;
        })
        .join("\n");

  // ── Per-line rendering (with highlight for errors) ────────────
  const MAX_HIGHLIGHT_LINES = 8_000;
  const lines = filteredLogs ? filteredLogs.split("\n") : [];
  const useLineHighlight = lines.length <= MAX_HIGHLIGHT_LINES;

  function renderLines() {
    if (!filteredLogs) {
      if (logs && !isPlaceholder(logs)) {
        return errorsOnly
          ? "No error lines in current logs."
          : "No lines match current filters.";
      }
      return "No logs available.";
    }
    if (!useLineHighlight) return filteredLogs;
    const lineEls = lines.map((line, i) => {
      const isError = line.trim() && isErrorLine(line);
      return (
        <span
          key={i}
          style={{
            display: "block",
            ...(isError
              ? {
                  color: "#F87171",
                  background: "rgba(248, 113, 113, 0.08)",
                  borderLeft: "2px solid rgba(248, 113, 113, 0.4)",
                  paddingLeft: "4px",
                }
              : {}),
          }}
        >
          {line || "\u00A0"}
        </span>
      );
    });
    // Return a fragment so the pre renders it directly
    return <>{lineEls}</>;
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 h-full flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">
            System Logs
          </h1>
          {lastUpdated && (
            <span className="text-xs text-on-surface-variant">Last updated: {lastUpdated}</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Service selector */}
          <div className="flex gap-1 p-0.5 rounded-[var(--radius-button)]" style={{ background: "#1E293B", border: "1px solid rgba(71, 85, 105, 0.25)" }}>
            {SERVICES.map((s) => (
              <button
                key={s}
                onClick={() => { setService(s); setLogs("Loading..."); }}
                className={`px-3 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-colors ${
                  service === s
                    ? "bg-surface-container text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {LABELS[s]}
              </button>
            ))}
          </div>

          {/* Filter input */}
          <input
            className="bg-surface border border-outline-variant/40 rounded-[var(--radius-button)] px-2.5 py-1.5 text-xs text-on-surface outline-none focus:border-primary w-40 transition-colors"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          {/* Errors Only checkbox */}
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => setErrorsOnly(e.target.checked)}
              className="accent-primary"
            />
            Errors Only
          </label>

          {/* Exclude Web checkbox */}
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeWeb}
              onChange={(e) => setExcludeWeb(e.target.checked)}
              className="accent-primary"
            />
            Exclude Web
          </label>

          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-primary"
            />
            Auto-refresh
          </label>

          {/* Error alert summary + Mark Resolved */}
          {errorCount > 0 && (
            <>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-mono rounded-[var(--radius-pill)]"
                style={{
                  background: "rgba(248, 113, 113, 0.12)",
                  color: "#F87171",
                  border: "1px solid rgba(248, 113, 113, 0.25)",
                }}
              >
                <span className="material-symbols-outlined text-sm">error</span>
                {errorCount} error{errorCount !== 1 ? "s" : ""}
                {acknowledgedAt
                  ? ` since ${new Date(acknowledgedAt).toLocaleTimeString()}`
                  : " in past 7d"}
              </span>
              <button
                onClick={async () => {
                  setAcknowledging(true);
                  const ackTs = Date.now();
                  try {
                    const res = await fetch("/api/logs/alerts/acknowledge", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    setErrorCount(0);
                    setAcknowledgedAt(ackTs);
                    toast.showToast("Alerts acknowledged", "success");
                  } catch {
                    toast.showToast("Failed to acknowledge alerts", "error");
                    await fetchAlerts();
                  } finally {
                    setAcknowledging(false);
                  }
                }}
                disabled={acknowledging}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: "rgba(248, 113, 113, 0.12)",
                  color: "#F87171",
                  border: "1px solid rgba(248, 113, 113, 0.25)",
                }}
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {acknowledging ? "Acknowledging…" : `Mark Resolved (${errorCount})`}
              </button>
            </>
          )}

          {/* Manual refresh */}
          <button
            onClick={() => fetchLogs(service, false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>

        {/* Terminal panel */}
        <div
          className="flex-1 min-h-0 relative rounded-[var(--radius-card)] overflow-hidden border border-outline-variant/25"
          style={{ background: "#0B1121" }}
        >
          <pre
            ref={terminalRef}
            className="absolute inset-0 p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap"
            style={{
              color: "#E2E8F0",
            }}
          >
            {renderLines()}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
