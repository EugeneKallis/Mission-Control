/**
 * In-process pub/sub event bus for terminal output fan-out.
 * This is a singleton — all connected clients and the macro runner
 * share the same bus instance.
 */

export interface LiveMessage {
  type: "output" | "status" | "control" | "reload";
  text?: string;
  macroId?: number;
  status?: string;
  triggeredBy?: string;
  timestamp: number;
}

type Subscriber = (msg: LiveMessage) => void;

export class LiveBus {
  private subscribers = new Set<Subscriber>();

  /**
   * Subscribe to all messages published on the bus.
   * Returns an unsubscribe function.
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Publish a message to all active subscribers.
   */
  publish(msg: LiveMessage): void {
    // Iterate over a snapshot so a subscriber that unsubscribes
    // during iteration doesn't affect the current pass.
    for (const sub of [...this.subscribers]) {
      try {
        sub(msg);
      } catch {
        // Subscriber errors shouldn't crash the bus
      }
    }
  }

  /** Number of active subscribers (useful for debuggability) */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

/** Shared singleton bus instance used across the app. */
export const liveBus = new LiveBus();
