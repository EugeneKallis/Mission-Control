/**
 * Unit tests for src/lib/live-bus.ts
 *
 * Covers:
 *  - subscribe() returns an unsubscribe fn
 *  - publish() fans out to all subscribers
 *  - errors in one subscriber don't break the bus or other subscribers
 *  - subscribers can safely unsubscribe while a publish is iterating
 *  - subscriberCount reflects active subscribers
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { LiveBus, type LiveMessage } from "./live-bus";

describe("LiveBus", () => {
  let bus: LiveBus;

  beforeEach(() => {
    bus = new LiveBus();
  });

  test("starts with no subscribers", () => {
    expect(bus.subscriberCount).toBe(0);
  });

  test("subscribe returns an unsubscribe function", () => {
    const unsub = bus.subscribe(() => {});
    expect(typeof unsub).toBe("function");
    expect(bus.subscriberCount).toBe(1);
    unsub();
    expect(bus.subscriberCount).toBe(0);
  });

  test("publish delivers a message to every subscriber", () => {
    const a: LiveMessage[] = [];
    const b: LiveMessage[] = [];
    bus.subscribe((m) => a.push(m));
    bus.subscribe((m) => b.push(m));

    const msg: LiveMessage = { type: "output", text: "hello", timestamp: 1 };
    bus.publish(msg);

    expect(a).toEqual([msg]);
    expect(b).toEqual([msg]);
  });

  test("publish with no subscribers is a no-op (no throw)", () => {
    expect(() =>
      bus.publish({ type: "reload", timestamp: Date.now() })
    ).not.toThrow();
  });

  test("subscriber that throws does not stop other subscribers from receiving", () => {
    const received: LiveMessage[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((m) => received.push(m));

    expect(() =>
      bus.publish({ type: "output", text: "ok", timestamp: 1 })
    ).not.toThrow();

    expect(received).toHaveLength(1);
  });

  test("subscriber can call subscribe() during publish without breaking iteration", () => {
    // The bus snapshots subscribers via [...this.subscribers] before iterating,
    // so a subscriber that adds new ones doesn't extend the current publish.
    let aCalls = 0;
    const bCalls: number[] = [];
    bus.subscribe(() => {
      aCalls++;
      bus.subscribe(() => {}); // mutate during publish (no effect on this pass)
    });
    let counter = 0;
    bus.subscribe(() => {
      bCalls.push(++counter);
    });

    bus.publish({ type: "output", text: "1", timestamp: 1 });
    bus.publish({ type: "output", text: "2", timestamp: 2 });

    expect(aCalls).toBe(2);
    expect(bCalls).toEqual([1, 2]);
  });

  test("unsubscribe during publish drops future messages for that subscriber", () => {
    const seen: number[] = [];
    let unsub: () => void = () => {};
    unsub = bus.subscribe((m) => {
      seen.push(m.timestamp);
      if (m.timestamp === 1) unsub();
    });

    bus.publish({ type: "output", text: "1", timestamp: 1 });
    bus.publish({ type: "output", text: "2", timestamp: 2 });
    bus.publish({ type: "output", text: "3", timestamp: 3 });

    // First message reaches, unsubscribes, subsequent messages don't.
    expect(seen).toEqual([1]);
    expect(bus.subscriberCount).toBe(0);
  });

  test("subscriberCount accurately reflects additions and removals", () => {
    const u1 = bus.subscribe(() => {});
    const u2 = bus.subscribe(() => {});
    const u3 = bus.subscribe(() => {});
    expect(bus.subscriberCount).toBe(3);
    u1();
    expect(bus.subscriberCount).toBe(2);
    u2();
    u3();
    expect(bus.subscriberCount).toBe(0);
  });
});
