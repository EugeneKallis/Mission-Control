/**
 * In-memory agent connection registry.
 *
 * The web server keeps a map of `hostname → WebSocket` so the runner
 * can dispatch a `runOnAgent` macro to a specific agent and stream its
 * output back. Mirrors `agentClients` + `ActiveAgentCommands` in
 * `~/ServerTool/cmd/web/handler/handler.go` and `agent.go`.
 *
 * This is process-local — the agent binary is expected to maintain a
 * persistent WS connection. If the web server restarts, all agents
 * reconnect on their next heartbeat.
 */

import type { WebSocket } from "ws";

/** Pending command waiting for an agent to send back output/exit. */
interface PendingCommand {
  resolve: (msg: AgentMessage) => void;
  reject: (err: Error) => void;
  /** Called with each `output` chunk as it arrives (for live streaming). */
  onChunk?: (text: string) => void;
  /** Called when the command exits (for live streaming). */
  onExit?: (exitCode: number) => void;
  /** Timer to reject if the agent never responds. */
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export interface AgentMessage {
  type: "output" | "exit" | "error" | "status";
  payload?: string;
  commandID: number;
  exitCode?: number;
  /** Status payload (only when type="status"). */
  status?: {
    cpu_usage?: number;
    memory_total?: number;
    memory_used?: number;
    network_sent?: number;
    network_recv?: number;
    ip_address?: string;
    version?: string;
  };
}

export interface AgentCommand {
  type: "exec";
  command: string;
  commandID: number;
  dir?: string;
}

class AgentRegistry {
  private clients = new Map<string, WebSocket>();
  private pending = new Map<number, PendingCommand>();
  private nextCommandId = 1;
  private ipByHostname = new Map<string, string>();

  /** Register an agent's WS connection. Replaces any existing one. */
  register(hostname: string, ws: WebSocket, ip?: string): void {
    // Close any prior connection for the same host (last write wins).
    const prior = this.clients.get(hostname);
    if (prior && prior !== ws) {
      try {
        prior.close();
      } catch {
        /* noop */
      }
    }
    this.clients.set(hostname, ws);
    if (ip) this.ipByHostname.set(hostname, ip);
  }

  /** Remove an agent's connection (e.g. on disconnect). */
  unregister(hostname: string): void {
    this.clients.delete(hostname);
    // Fail any in-flight commands targeting this host.
    for (const [cmdId, pc] of this.pending) {
      pc.reject(new Error(`Agent ${hostname} disconnected mid-command`));
      clearTimeout(pc.timeoutHandle);
      this.pending.delete(cmdId);
    }
  }

  /** True if a live WS is registered for `hostname`. */
  isConnected(hostname: string): boolean {
    const ws = this.clients.get(hostname);
    return Boolean(ws && ws.readyState === 1 /* OPEN */);
  }

  /** List of hostnames with a live connection. */
  connectedHostnames(): string[] {
    const out: string[] = [];
    for (const [host, ws] of this.clients) {
      if (ws.readyState === 1) out.push(host);
    }
    return out;
  }

  /** IP we last saw for a hostname (from the install script's request). */
  getIp(hostname: string): string | undefined {
    return this.ipByHostname.get(hostname);
  }

  /**
   * Dispatch a command to an agent and wait for the final response.
   * Resolves with the final `exit` (or `error`) message; chunks are
   * delivered via the optional callbacks.
   */
  async dispatch(
    hostname: string,
    command: string,
    options: {
      dir?: string;
      timeoutMs?: number;
      onChunk?: (text: string) => void;
      onExit?: (exitCode: number) => void;
    } = {}
  ): Promise<AgentMessage> {
    const ws = this.clients.get(hostname);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`Agent ${hostname} is not connected`);
    }

    const commandID = this.nextCommandId++;
    const payload: AgentCommand = {
      type: "exec",
      command,
      commandID,
      dir: options.dir,
    };

    return new Promise<AgentMessage>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(commandID);
        reject(new Error(`Agent ${hostname} timed out after ${options.timeoutMs ?? 300_000}ms`));
      }, options.timeoutMs ?? 300_000);

      this.pending.set(commandID, {
        resolve,
        reject,
        onChunk: options.onChunk,
        onExit: options.onExit,
        timeoutHandle,
      });

      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timeoutHandle);
        this.pending.delete(commandID);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Deliver an inbound message from an agent to the matching pending
   * command, or update last-seen for status messages. Called by the
   * `/api/agent/ws` handler when it reads a message.
   */
  deliver(hostname: string, msg: AgentMessage): void {
    // Status messages don't target a specific command — they're heartbeat
    // updates. The WS handler is expected to upsert `server_agents` from
    // these directly; we just record the IP/version.
    if (msg.type === "status" && msg.status) {
      if (msg.status.ip_address) this.ipByHostname.set(hostname, msg.status.ip_address);
      return;
    }

    const pc = this.pending.get(msg.commandID);
    if (!pc) return; // late delivery for a timed-out/cancelled command

    if (msg.type === "output" && typeof msg.payload === "string") {
      pc.onChunk?.(msg.payload);
      return;
    }
    if (msg.type === "exit") {
      pc.onExit?.(msg.exitCode ?? 0);
      clearTimeout(pc.timeoutHandle);
      this.pending.delete(msg.commandID);
      pc.resolve(msg);
      return;
    }
    if (msg.type === "error") {
      clearTimeout(pc.timeoutHandle);
      this.pending.delete(msg.commandID);
      pc.reject(new Error(msg.payload || "Agent reported error"));
      return;
    }
  }

  /** Number of registered agents (any state). Useful for diagnostics. */
  get size(): number {
    return this.clients.size;
  }
}

/** Singleton instance — imported by the WS route, the runner, and the install script. */
export const agentRegistry = new AgentRegistry();
