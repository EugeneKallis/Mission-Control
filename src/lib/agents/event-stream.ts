/**
 * Per-agent SSE event streams. The server uses these to push commands
 * to a specific agent. Each connected agent opens one SSE stream to
 * `/api/agent/events?hostname=X`; the server holds it open and writes
 * `command` events as they become available.
 *
 * This is the server→agent half of the connection. The agent→server
 * half (heartbeat, output chunks, exit codes) is plain HTTP POST.
 *
 * This design avoids WebSocket (Next.js App Router doesn't natively
 * support upgrades) while still giving the server a push channel.
 */

type Subscriber = (data: unknown) => void;

class AgentEventBus {
  /** hostname → set of SSE subscribers (one per connected agent process). */
  private streams = new Map<string, Set<Subscriber>>();

  /** Subscribe to commands for a given hostname. */
  subscribe(hostname: string, callback: Subscriber): () => void {
    let set = this.streams.get(hostname);
    if (!set) {
      set = new Set();
      this.streams.set(hostname, set);
    }
    set.add(callback);
    return () => {
      set?.delete(callback);
      if (set && set.size === 0) this.streams.delete(hostname);
    };
  }

  /** Push a JSON-serializable payload to every subscriber for a hostname. */
  publish(hostname: string, data: unknown): number {
    const set = this.streams.get(hostname);
    if (!set) return 0;
    let n = 0;
    for (const sub of [...set]) {
      try {
        sub(data);
        n++;
      } catch {
        // subscriber error — drop it
        set.delete(sub);
      }
    }
    return n;
  }

  /** True if any agent is currently listening for `hostname`. */
  isOnline(hostname: string): boolean {
    const set = this.streams.get(hostname);
    return Boolean(set && set.size > 0);
  }

  /** Number of distinct hostnames with an open stream. */
  get onlineCount(): number {
    return this.streams.size;
  }
}

export const agentEvents = new AgentEventBus();
