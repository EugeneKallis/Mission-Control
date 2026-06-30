#!/usr/bin/env bun
import "@/lib/logger";
/**
 * Mission Control Agent.
 *
 * Bun-native replacement for the original Go agent binary
 * (~/ServerTool/cmd/agent/main.go). Runs on a remote host, opens an
 * SSE stream to the server for receiving commands, and POSTs heartbeats
 * with status + command output back to the server.
 *
 *   bun run src/workers/agent.ts -server http://192.168.1.10:3001
 *
 * The server's `/api/agent/install` script installs this as a systemd
 * service. The agent reports CPU / memory / network stats every
 * HEARTBEAT_MS milliseconds, executes any command the server dispatches,
 * and streams stdout/stderr chunks back to the server.
 */

import { spawn } from "bun";
import { hostname as osHostname, networkInterfaces } from "os";
import { cpus, totalmem, freemem } from "os";

// ── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const SERVER_URL = arg("-server", process.env.SERVER_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);
const HOSTNAME = arg("-hostname", osHostname());
const HEARTBEAT_MS = Number(arg("-heartbeat-ms", "5000"));

// ── Logging ────────────────────────────────────────────────────────────────

/** Timestamped log. The global console.log monkeypatch in @/lib/logger adds
 *  the ISO timestamp, so this is just a clean pass-through. */
function log(...parts: unknown[]): void {
  console.log(...parts);
}

// ── Network counters (sampled; not strictly monotonic) ────────────────────

let lastNetSample: { sent: number; recv: number; ts: number } | null = null;

export function getIpAddress(): string {
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "0.0.0.0";
}

export function getNetworkCounters(): { sent: number; recv: number } {
  // We can't easily get cumulative network bytes in pure JS without
  // /proc/net/dev. Return cumulative-zero and let the server interpret
  // these as "current rate" if it wants. A future improvement is to
  // parse /proc/net/dev.
  const now = Date.now();
  const sent = 0;
  const recv = 0;
  lastNetSample = { sent, recv, ts: now };
  return { sent, recv };
}

// ── System stats ───────────────────────────────────────────────────────────

export function getCpuUsage(): number {
  // Synchronous CPU usage in pure JS is tricky. Use a small sample:
  const samples = cpus();
  let total = 0;
  let idle = 0;
  for (const c of samples) {
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
    idle += c.times.idle;
  }
  return total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
}

export function getMemory(): { total: number; used: number } {
  const total = totalmem();
  const used = total - freemem();
  return { total, used };
}

// ── SSE wire format parser (pure) ──────────────────────────────────────────

export interface SseEvent {
  /** The event name from "event: foo" — undefined if no event line was present. */
  name?: string;
  /** The data payload (joined "data:" lines). */
  data: string;
}

export interface ParsedSseChunk {
  events: SseEvent[];
  /** Trailing bytes that didn't yet contain a full "\n\n" delimiter. */
  remainder: string;
}

/**
 * Parse a SSE message stream buffer. The wire format is one or more
 * records separated by "\n\n", where each record may contain:
 *   - "event: <name>"     (optional)
 *   - "data: <text>"      (one or more, joined with "\n")
 *   - ": <comment>"       (ignored)
 * Returns the complete events and the trailing remainder that should
 * be prepended to the next chunk.
 *
 * Extracted from `connectEvents` for unit testing.
 */
export function parseSseChunk(buffer: string): ParsedSseChunk {
  const events: SseEvent[] = [];
  let idx: number;
  while ((idx = buffer.indexOf("\n\n")) !== -1) {
    const raw = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);

    const lines = raw.split("\n");
    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(":")) continue; // comment / keep-alive
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    const data = dataLines.join("\n");
    // Drop records that contain only comments or are empty.
    if (!eventName && !data) continue;
    events.push({ name: eventName ?? undefined, data });
  }
  return { events, remainder: buffer };
}

// ── Command execution ─────────────────────────────────────────────────────

interface InFlightCommand {
  proc: ReturnType<typeof spawn>;
  commandID: number;
  hostname: string;
}

const inflight = new Map<number, InFlightCommand>();

async function executeCommand(
  commandID: number,
  command: string,
  dir: string | undefined
): Promise<void> {
  log(`[cmd ${commandID}] exec: ${command}`);

  const proc = spawn({
    cmd: ["bash", "-c", command],
    cwd: dir || process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  inflight.set(commandID, { proc, commandID, hostname: HOSTNAME });

  // Stream stdout
  if (proc.stdout) {
    const reader = proc.stdout.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await postResult("output", commandID, new TextDecoder().decode(value));
          }
        }
      } catch (err) {
        log(`[cmd ${commandID}] stdout read error:`, err);
      }
    })();
  }

  // Stream stderr (with a tag prefix so the client can distinguish)
  if (proc.stderr) {
    const reader = proc.stderr.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const text = new TextDecoder().decode(value);
            await postResult("output", commandID, text);
          }
        }
      } catch (err) {
        log(`[cmd ${commandID}] stderr read error:`, err);
      }
    })();
  }

  const exitCode = await proc.exited;
  log(`[cmd ${commandID}] exit: ${exitCode}`);

  await postResult("exit", commandID, undefined, exitCode);
  inflight.delete(commandID);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────

async function postJSON(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function postResult(
  type: "output" | "exit" | "error",
  commandID: number,
  payload?: string,
  exitCode?: number
): Promise<void> {
  try {
    await postJSON("/api/agent/result", {
      hostname: HOSTNAME,
      type,
      commandID,
      payload,
      exitCode,
    });
  } catch (err) {
    log(`postResult(${type}, ${commandID}) failed:`, err);
  }
}

async function postHeartbeat(status: {
  cpu_usage: number;
  memory_total: number;
  memory_used: number;
  network_sent: number;
  network_recv: number;
}): Promise<void> {
  try {
    await postJSON("/api/agent/heartbeat", {
      hostname: HOSTNAME,
      ip_address: getIpAddress(),
      ...status,
      version: VERSION,
    });
  } catch (err) {
    log(`heartbeat failed:`, err);
  }
}

// ── SSE client ────────────────────────────────────────────────────────────

let es: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

interface AgentCommand {
  type: "exec";
  command: string;
  commandID: number;
  dir?: string;
}

/**
 * Manual SSE client over fetch + stream reader. Bun doesn't ship a
 * built-in EventSource so we parse the wire format ourselves.
 */
async function connectEvents(): Promise<void> {
  log(`connecting to events stream at ${SERVER_URL}/api/agent/events`);
  es = new AbortController();

  try {
    const res = await fetch(
      `${SERVER_URL}/api/agent/events?hostname=${encodeURIComponent(HOSTNAME)}`,
      {
        headers: { Accept: "text/event-stream" },
        signal: es.signal,
      }
    );
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }
    log("events stream open");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, remainder } = parseSseChunk(buffer);
      buffer = remainder;

      for (const evt of events) {
        if (evt.name === "hello") {
          log("received hello from server");
          continue;
        }
        if (!evt.data) continue;

        try {
          const parsed = JSON.parse(evt.data) as AgentCommand;
          if (parsed.type === "exec") {
            void executeCommand(parsed.commandID, parsed.command, parsed.dir);
          }
        } catch (err) {
          log("malformed event:", err, "raw:", evt.data.slice(0, 200));
        }
      }
    }
  } catch (err) {
    if (es?.signal.aborted) {
      log("events stream aborted");
      return;
    }
    log(`events stream error: ${err instanceof Error ? err.message : String(err)} — reconnecting in 5s`);
  } finally {
    es = null;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => void connectEvents(), 5000);
}

// ── Heartbeat loop ────────────────────────────────────────────────────────

const VERSION = "0.1.0";

async function heartbeatLoop(): Promise<void> {
  // First beat immediately
  while (true) {
    try {
      const mem = getMemory();
      const net = getNetworkCounters();
      const cpu = getCpuUsage();
      await postHeartbeat({
        cpu_usage: cpu,
        memory_total: mem.total,
        memory_used: mem.used,
        network_sent: net.sent,
        network_recv: net.recv,
      });
    } catch (err) {
      log("heartbeat loop error:", err);
    }
    await new Promise((r) => setTimeout(r, HEARTBEAT_MS));
  }
}

// ── Shutdown ─────────────────────────────────────────────────────────────

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutting down (${reason})`);
  try {
    es?.abort();
  } catch {
    /* noop */
  }
  for (const cmd of inflight.values()) {
    try {
      cmd.proc.kill();
    } catch {
      /* noop */
    }
  }
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Main ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  log(`agent starting — host=${HOSTNAME}, server=${SERVER_URL}, heartbeat=${HEARTBEAT_MS}ms`);
  void connectEvents();
  void heartbeatLoop();
}
