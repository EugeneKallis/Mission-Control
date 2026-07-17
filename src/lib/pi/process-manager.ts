/**
 * Pi Process Manager (singleton)
 *
 * Spawns and manages ONE `pi --mode rpc` child process shared by the
 * entire website. All browser connections (SSE, commands, state queries)
 * go through this single process.
 *
 * Architecture:
 *   Browser ←─SSE── /api/pi/events    ←─stdout── pi --mode rpc
 *   Browser ──POST→ /api/pi/command    ──stdin──→ pi --mode rpc
 *   Browser ──GET── /api/pi/state      ←─RPC──── pi --mode rpc
 *
 * The Pi process is spawned lazily on first request and persists until
 * the server shuts down or the process exits. Session data is stored
 * at ~/.pi/agent/sessions/mc-main/ for conversation persistence.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { accessSync, constants, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { PiEvent, RpcCommand, RpcResponse, PiSpawnOptions } from "./event-types";

// ── Event bus (single, shared by all SSE subscribers) ──────────────────────

type EventSubscriber = (event: PiEvent) => void;

class EventBus {
  private subscribers = new Set<EventSubscriber>();

  subscribe(callback: EventSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  publish(event: PiEvent): void {
    for (const sub of [...this.subscribers]) {
      try {
        sub(event);
      } catch {
        this.subscribers.delete(sub);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

// ── Parse a single line of Pi RPC output ───────────────────────────────────

function parseEvent(line: string): PiEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;

  try {
    const parsed = JSON.parse(trimmed) as PiEvent;
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Resolve the pi binary path ─────────────────────────────────────────────

let resolvedPiPath: string | null = null;

function getPiPath(): string {
  if (resolvedPiPath) return resolvedPiPath;

  try {
    const path = execSync("which pi", { encoding: "utf-8", timeout: 5000 }).trim();
    if (path) {
      resolvedPiPath = path;
      return path;
    }
  } catch {
    // fall through
  }

  const candidates = [
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
    "/usr/bin/pi",
    "/home/linuxbrew/.linuxbrew/bin/pi",
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      resolvedPiPath = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Pi binary not found. Install it with: npm install -g @earendil-works/pi-coding-agent"
  );
}

// ── Build CLI args from spawn options ──────────────────────────────────────

function buildArgs(options: PiSpawnOptions): string[] {
  const args: string[] = ["--mode", "rpc"];

  if (options.noSession) {
    args.push("--no-session");
  }
  // Pi does not support --cwd; the process inherits cwd from parent
  if (options.provider) {
    args.push("--provider", options.provider);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.thinkingLevel) {
    args.push("--thinking", options.thinkingLevel);
  }
  if (options.tools && options.tools.length > 0) {
    args.push("--tools", options.tools.join(","));
  }
  if (options.excludeTools && options.excludeTools.length > 0) {
    args.push("--exclude-tools", options.excludeTools.join(","));
  }
  if (options.noSkills) {
    args.push("--no-skills");
  }
  if (options.skills && options.skills.length > 0) {
    for (const skill of options.skills) {
      args.push("--skill", skill);
    }
  }
  if (options.noExtensions) {
    args.push("--no-extensions");
  }
  if (options.sessionPath) {
    args.push("--session", options.sessionPath);
  }
  return args;
}

// ── PiProcess (singleton) ─────────────────────────────────────────────────

class PiProcess {
  private proc: ChildProcess | null = null;
  private _bus = new EventBus();
  private _cwd: string;
  private lineBuffer = "";
  private _exited = false;
  private _exitCode: number | null = null;
  private cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly GRACE_PERIOD_MS = 30_000;
  private _ready: Promise<void>;
  private _resolveReady: (() => void) | null = null;

  constructor(cwd: string) {
    this._cwd = cwd;
  }

  get cwd(): string { return this._cwd; }
  get exited(): boolean { return this._exited; }
  get exitCode(): number | null { return this._exitCode; }
  get subscriberCount(): number { return this._bus.subscriberCount; }

  /** Spawn the Pi process. Idempotent. */
  spawn(options: PiSpawnOptions = {}): void {
    if (this.proc && !this._exited) return;

    this._exited = false;
    this._exitCode = null;

    const piPath = getPiPath();
    const sessionPath = options.sessionPath
      ?? join(homedir(), ".pi", "agent", "sessions", "mc-singleton.jsonl");
    const sessionDir = sessionPath.substring(0, sessionPath.lastIndexOf("/"));
    mkdirSync(sessionDir, { recursive: true });

    const args = buildArgs({
      ...options,
      cwd: this._cwd,
      sessionPath,
    });

    console.log(`[pi] Spawning singleton: ${piPath} ${args.join(" ")}`);

    this.proc = spawn(piPath, args, {
      cwd: this._cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PI_CODING_AGENT_DIR: undefined },
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString("utf-8");
      while (true) {
        const nlIndex = this.lineBuffer.indexOf("\n");
        if (nlIndex === -1) break;
        const rawLine = this.lineBuffer.slice(0, nlIndex);
        this.lineBuffer = this.lineBuffer.slice(nlIndex + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (!line) continue;
        const event = parseEvent(line);
        if (event) {
          this._bus.publish(event);
          // Resolve ready on the first connected event
          if (event.type === "connected" && this._resolveReady) {
            this._resolveReady();
            this._resolveReady = null;
          }
        }
      }
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text) console.log(`[pi] stderr: ${text}`);
    });

    this.proc.on("exit", (code) => {
      if (this.lineBuffer.trim()) {
        const event = parseEvent(this.lineBuffer);
        if (event) this._bus.publish(event);
      }
      this.lineBuffer = "";
      this._exited = true;
      this._exitCode = code;
      console.log(`[pi] Singleton exited with code ${code}`);
      this.proc = null;
    });

    this.proc.on("error", (err) => {
      console.error(`[pi] Singleton error:`, err.message);
      this._exited = true;
      this.proc = null;
    });
  }

  /** Send an RPC command. Throws if not running. */
  send(command: RpcCommand): void {
    if (!this.proc || !this.proc.stdin || this._exited) {
      throw new Error("Pi process is not running");
    }
    const json = JSON.stringify(command) + "\n";
    this.proc.stdin.write(json, "utf-8");
  }

  /** Send an RPC command and wait for the response (15s timeout). */
  sendAndWait(command: RpcCommand, timeoutMs: number = 15_000): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin || this._exited) {
        reject(new Error("Pi process is not running"));
        return;
      }

      const cmdType = command.type;
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Pi did not respond to '${cmdType}' within ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = this._bus.subscribe((event) => {
        if (event.type === "response" && event.command === cmdType) {
          clearTimeout(timer);
          unsubscribe();
          resolve(event as RpcResponse);
        }
      });

      const json = JSON.stringify(command) + "\n";
      this.proc.stdin.write(json, "utf-8");
    });
  }

  /** Wait for Pi to emit its first event (fully initialized). */
  async waitForReady(timeoutMs: number = 15_000): Promise<void> {
    if (this._booted) return;
    return new Promise((resolve) => {
      const unsub = this._bus.subscribe(() => {
        this._booted = true;
        unsub();
        clearTimeout(timer);
        resolve();
      });
      const timer = setTimeout(() => {
        unsub();
        this._booted = true; // resolve anyway on timeout
        resolve();
      }, timeoutMs);
    });
  }

  /** Subscribe to all events. Returns unsubscribe function. */
  subscribe(callback: EventSubscriber): () => void {
    return this._bus.subscribe(callback);
  }

  cancelCleanup(): void {
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
  }

  scheduleCleanup(): void {
    if (this.cleanupTimeout) return;
    this.cleanupTimeout = setTimeout(() => {
      this.cleanupTimeout = null;
      if (this._bus.subscriberCount === 0) {
        console.log("[pi] Singleton idle — cleaning up");
        this.kill();
      }
    }, this.GRACE_PERIOD_MS);
  }

  kill(): void {
    this.cancelCleanup();
    const proc = this.proc;
    if (proc && !this._exited) {
      console.log("[pi] Killing singleton");
      proc.stdin?.end();
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000).unref();
    }
    this.proc = null;
    this._exited = true;
  }
}

// ── Singleton Process Manager ─────────────────────────────────────────────

class PiProcessManager {
  private process: PiProcess | null = null;

  /**
   * Get the singleton process, creating it if needed.
   * This is the primary entry point — all routes call this.
   */
  async getOrCreate(options: PiSpawnOptions = {}): Promise<PiProcess> {
    if (this.process && !this.process.exited) {
      this.process.cancelCleanup();
      return this.process;
    }

    this.process = new PiProcess(process.cwd());
    this.process.spawn(options);
    await this.process.waitForReady();
    return this.process;
  }

  /**
   * Get the singleton if it's running. Returns undefined if not spawned yet.
   */
  get(): PiProcess | undefined {
    if (this.process && !this.process.exited) {
      return this.process;
    }
    return undefined;
  }

  /**
   * Kill the singleton process.
   */
  destroy(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export const piProcessManager = new PiProcessManager();
