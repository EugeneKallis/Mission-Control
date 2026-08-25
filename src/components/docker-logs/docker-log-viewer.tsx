"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  BACKFILL_STEPS,
  DEFAULT_BACKFILL_LINES,
  DOCKER_LOGS_STORAGE_KEY,
  buildProxyLogUrl,
  decodeLogMessage,
  formatLogTimestamp,
  logEventKey,
  type DozzleContainer,
  type DozzleLogEvent,
  type DozzleSearchStatus,
} from "@/lib/docker-logs";

const MAX_BUFFER_LINES = 5000;
const BACKFILL_CHUNK_LIMIT = 500;

type DockerLogViewerProps = {
  endpointId: number;
  container: DozzleContainer;
  onClose: () => void;
};

function readInitialBackfillLines(): number {
  if (typeof window === "undefined") return DEFAULT_BACKFILL_LINES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DOCKER_LOGS_STORAGE_KEY) ?? "{}");
    return BACKFILL_STEPS.includes(stored.backfillLines) ? stored.backfillLines : DEFAULT_BACKFILL_LINES;
  } catch {
    return DEFAULT_BACKFILL_LINES;
  }
}

function persistBackfillLines(value: number) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DOCKER_LOGS_STORAGE_KEY) ?? "{}");
    window.localStorage.setItem(DOCKER_LOGS_STORAGE_KEY, JSON.stringify({ ...stored, backfillLines: value }));
  } catch {
    // Blocked localStorage must not stop the log viewer.
  }
}

function parseJsonLines(text: string): DozzleLogEvent[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as DozzleLogEvent;
        return value && typeof value === "object" ? [value] : [];
      } catch {
        return [];
      }
    });
}

function mergeEvents(existing: DozzleLogEvent[], incoming: DozzleLogEvent[]): DozzleLogEvent[] {
  const result = [...existing];
  const seen = new Set(result.map((event) => logEventKey(event)));
  for (const event of incoming) {
    const key = logEventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  result.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return result.slice(-MAX_BUFFER_LINES);
}

async function fetchBackfill(
  endpointId: number,
  container: DozzleContainer,
  lines: number,
  signal: AbortSignal,
): Promise<DozzleLogEvent[]> {
  const now = Date.now();
  const loadChunk = async (from: number, to: number, min: number) => {
    const url = buildProxyLogUrl(
      endpointId,
      container.id,
      container.host,
      "backfill",
      Math.min(min, BACKFILL_CHUNK_LIMIT),
      new Date(from).toISOString(),
      new Date(to).toISOString(),
    );
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Backfill failed (HTTP ${response.status})`);
    return parseJsonLines(await response.text());
  };

  const newest = await loadChunk(now - 60_000, now, Math.min(lines, BACKFILL_CHUNK_LIMIT));
  if (lines <= BACKFILL_CHUNK_LIMIT || newest.length === 0) return newest.slice(-lines);

  const oldest = newest.reduce<number | null>((value, event) => {
    if (typeof event.ts !== "number") return value;
    return value === null ? event.ts : Math.min(value, event.ts);
  }, null);
  if (oldest === null) return newest.slice(-lines);

  const older = await loadChunk(oldest - 60_000, oldest, lines - BACKFILL_CHUNK_LIMIT);
  return mergeEvents(older, newest).slice(-lines);
}

export function DockerLogViewer({ endpointId, container, onClose }: DockerLogViewerProps) {
  const [backfillLines, setBackfillLines] = useState(readInitialBackfillLines);
  const [events, setEvents] = useState<DozzleLogEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<DozzleSearchStatus | null>(null);
  const pendingRef = useRef<DozzleLogEvent[]>([]);
  const backfillDoneRef = useRef(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    persistBackfillLines(backfillLines);
  }, [backfillLines]);

  useEffect(() => {
    const source = new EventSource(buildProxyLogUrl(endpointId, container.id, container.host, "stream"));
    const abortController = new AbortController();
    let disposed = false;

    // This effect resets the external stream session when its identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([]);
    setLoading(true);
    setBackfillError(null);
    setPaused(false);
    pausedRef.current = false;
    backfillDoneRef.current = false;
    setSearchStatus(null);
    pendingRef.current = [];

    const addLiveEvents = (incoming: DozzleLogEvent[]) => {
      if (disposed) return;
      if (pausedRef.current || !backfillDoneRef.current) {
        pendingRef.current = mergeEvents(pendingRef.current, incoming);
        return;
      }
      setEvents((current) => mergeEvents(current, incoming));
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => {
      if (!disposed) setConnected(false);
    };
    source.onmessage = (message) => {
      try {
        addLiveEvents([JSON.parse(message.data) as DozzleLogEvent]);
      } catch {
        // Ignore malformed upstream keepalive/data frames.
      }
    };

    const onBackfill = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as DozzleLogEvent[];
        if (Array.isArray(data)) addLiveEvents(data);
      } catch {
        // Ignore malformed optional upstream backfill events.
      }
    };
    const onSearchStatus = (event: Event) => {
      try {
        setSearchStatus(JSON.parse((event as MessageEvent).data) as DozzleSearchStatus);
      } catch {
        // Ignore malformed optional upstream status events.
      }
    };
    source.addEventListener("logs-backfill", onBackfill);
    source.addEventListener("search-status", onSearchStatus);

    fetchBackfill(endpointId, container, backfillLines, abortController.signal)
      .then((loaded) => {
        if (disposed) return;
        setEvents((current) => mergeEvents(loaded, pendingRef.current.length > 0 ? pendingRef.current : current));
        pendingRef.current = [];
      })
      .catch((cause) => {
        if (!disposed && !abortController.signal.aborted) {
          setBackfillError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (disposed) return;
        backfillDoneRef.current = true;
        if (!pausedRef.current && pendingRef.current.length > 0) {
          setEvents((current) => mergeEvents(current, pendingRef.current));
          pendingRef.current = [];
        }
        setLoading(false);
      });

    return () => {
      disposed = true;
      abortController.abort();
      source.close();
    };
  }, [backfillLines, container, endpointId]);

  useEffect(() => {
    if (!paused && pendingRef.current.length > 0 && !loading) {
      setEvents((current) => mergeEvents(current, pendingRef.current));
      pendingRef.current = [];
    }
  }, [loading, paused]);

  const visibleEvents = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => decodeLogMessage(event).toLowerCase().includes(query));
  }, [events, filter]);

  useEffect(() => {
    if (!paused && terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [paused, visibleEvents.length]);

  const nextBackfill = BACKFILL_STEPS[BACKFILL_STEPS.indexOf(backfillLines as typeof BACKFILL_STEPS[number]) + 1];

  return (
    <Modal
      open
      onClose={onClose}
      title={container.name}
      icon="terminal"
      className="max-w-6xl h-[85vh]"
      contentClassName="max-h-none min-h-0 p-4 flex flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1.5 text-xs ${connected ? "text-success" : "text-error"}`}>
          <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-error"}`} />
          {connected ? "Live" : "Reconnecting…"}
        </span>
        <span className="text-xs text-on-surface-variant font-mono truncate">{container.image}</span>
        <span className="text-xs text-on-surface-variant/60">{visibleEvents.length}/{events.length} lines</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-on-surface-variant" htmlFor="docker-log-backfill">Backfill</label>
          <select
            id="docker-log-backfill"
            value={backfillLines}
            onChange={(event) => setBackfillLines(Number(event.target.value))}
            className="bg-surface-container-high border border-outline-variant/40 rounded-[var(--radius-button)] px-2 py-1 text-xs text-on-surface"
          >
            {BACKFILL_STEPS.map((value) => <option key={value} value={value}>{value} lines</option>)}
          </select>
          <button
            type="button"
            onClick={() => nextBackfill && setBackfillLines(nextBackfill)}
            disabled={!nextBackfill}
            className="px-2.5 py-1 text-xs rounded-[var(--radius-button)] bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
          >
            Load more
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          aria-label="Filter logs"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter loaded logs…"
          className="flex-1 min-w-48 bg-surface-container-high border border-outline-variant/40 rounded-[var(--radius-button)] px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
        />
        <button type="button" onClick={() => setPaused((value) => !value)} className="px-3 py-2 text-xs rounded-[var(--radius-button)] border border-outline-variant/40 text-on-surface hover:bg-surface-container-high">
          {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={() => setEvents([])} className="px-3 py-2 text-xs rounded-[var(--radius-button)] border border-outline-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high">
          Clear
        </button>
      </div>

      {loading && <div className="mb-2 text-xs text-info">Loading the last {backfillLines} lines…</div>}
      {searchStatus && !searchStatus.done && (
        <div className="mb-2 text-xs text-info">Backfilling… {searchStatus.matches} lines found</div>
      )}
      {backfillError && <div className="mb-2 text-xs text-warning">{backfillError} Live output will continue.</div>}

      <div ref={terminalRef} className="flex-1 min-h-0 overflow-y-auto rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: "var(--terminal-bg)", color: "var(--terminal-fg)" }}>
        {visibleEvents.length === 0 ? (
          <div className="text-terminal-fg-alt/70">No logs loaded yet. Waiting for output…</div>
        ) : visibleEvents.map((event, index) => {
          const message = decodeLogMessage(event);
          const level = event.l?.toLowerCase();
          const tone = event.s === "stderr" || level === "error" || level === "fatal" ? "text-error" : "text-terminal-fg";
          return (
            <div key={`${logEventKey(event)}-${index}`} className={`flex gap-3 whitespace-pre-wrap break-words ${tone}`}>
              <span className="shrink-0 text-terminal-fg-alt/60">{formatLogTimestamp(event.ts)}</span>
              <span className="min-w-0">{message}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
