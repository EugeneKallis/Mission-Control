"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";

const LABELS: Record<string, string> = {
  web: "Web",
  "magnet-bridge": "Magnet Bridge",
  "broken-link-checker": "BL Finder",
  scraper: "Scraper",
};

const SERVICES = Object.keys(LABELS);

export default function LogsPage() {
  const [logs, setLogs] = useState<string>("Loading...");
  const [service, setService] = useState("web");
  const [filter, setFilter] = useState("");
  const [excludeWeb, setExcludeWeb] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalRef = useRef<HTMLPreElement>(null);
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

  const filteredLogs = logs
    .split("\n")
    .filter((line) => {
      if (excludeWeb && (line.startsWith("GET ") || line.startsWith("POST ") || line.startsWith('"GET ') || line.startsWith('"POST '))) {
        return false;
      }
      if (filter && !line.toLowerCase().includes(filter.toLowerCase())) {
        return false;
      }
      return true;
    })
    .join("\n");

  return (
    <AppShell>
      <div className="p-4 md:p-6 h-full flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <h1 className="text-2xl font-bold text-[#E5E2E1] tracking-tight" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            System Logs
          </h1>
          {lastUpdated && (
            <span className="text-xs text-[#849587]">Last updated: {lastUpdated}</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Service selector */}
          <div className="flex gap-1" style={{ background: "#131313", border: "1px solid rgba(59, 75, 63, 0.3)", borderRadius: "6px", padding: "2px" }}>
            {SERVICES.map((s) => (
              <button
                key={s}
                onClick={() => { setService(s); setLogs("Loading..."); }}
                className="px-3 py-2 text-xs font-semibold rounded-none transition-colors"
                style={{
                  background: service === s ? "#201F1F" : "transparent",
                  color: service === s ? "#E5E2E1" : "#849587",
                }}
              >
                {LABELS[s]}
              </button>
            ))}
          </div>

          {/* Filter input */}
          <input
            className="bg-[#131313] border border-[#3B4B3F] rounded px-2.5 py-1.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B] w-40"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          {/* Exclude Web checkbox */}
          <label className="flex items-center gap-2 text-xs text-[#849587] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeWeb}
              onChange={(e) => setExcludeWeb(e.target.checked)}
              className="accent-[#618B6B]"
            />
            Exclude Web
          </label>

          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 text-xs text-[#849587] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[#618B6B]"
            />
            Auto-refresh
          </label>

          {/* Manual refresh */}
          <button
            onClick={() => fetchLogs(service, false)}
            className="px-4 py-2 text-xs font-semibold rounded-none transition-colors"
            style={{ background: "#201F1F", color: "#E5E2E1", border: "1px solid rgba(59, 75, 63, 0.3)" }}
          >
            Refresh
          </button>
        </div>

        {/* Terminal panel */}
        <div
          className="flex-1 min-h-0 relative rounded-lg overflow-hidden"
          style={{ background: "#0E0E0E", border: "1px solid rgba(59, 75, 63, 0.3)" }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
            style={{
              background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 156, 0.08) 2px, rgba(0, 255, 156, 0.08) 4px)",
            }}
          />
          <pre
            ref={terminalRef}
            className="absolute inset-0 p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap"
            style={{
              color: "#E5E2E1",
              scrollbarWidth: "thin",
              scrollbarColor: "#3B4B3F transparent",
            }}
          >
            {filteredLogs || "No logs available."}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
