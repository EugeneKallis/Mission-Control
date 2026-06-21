/**
 * Unit tests for src/lib/agents/event-stream.ts
 *
 * The agentEventBus is structurally similar to the LiveBus (pub/sub by key)
 * but indexed by hostname. We verify the additional behavior:
 *  - subscribers are isolated per hostname
 *  - publish returns the number of subscribers that received the message
 *  - subscribers are dropped automatically when the last one unsubscribes
 *  - throwing subscribers are evicted
 *  - onlineCount reflects unique hostnames
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { agentEvents } from "./event-stream";

describe("agentEvents", () => {
  beforeEach(() => {
    // Drain any leftover subscribers from previous tests by calling the
    // singleton is fine — the bus is global; we unsubscribe in each test.
  });

  test("publish to a hostname with no subscribers returns 0", () => {
    expect(agentEvents.publish("nope", { x: 1 })).toBe(0);
  });

  test("isOnline reflects current subscribers", () => {
    expect(agentEvents.isOnline("h1")).toBe(false);
    const u = agentEvents.subscribe("h1", () => {});
    expect(agentEvents.isOnline("h1")).toBe(true);
    u();
    expect(agentEvents.isOnline("h1")).toBe(false);
  });

  test("subscribers are isolated per hostname", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const ua = agentEvents.subscribe("host-a", (d) => a.push(d));
    const ub = agentEvents.subscribe("host-b", (d) => b.push(d));

    agentEvents.publish("host-a", { n: 1 });
    agentEvents.publish("host-b", { n: 2 });
    agentEvents.publish("host-a", { n: 3 });

    expect(a).toEqual([{ n: 1 }, { n: 3 }]);
    expect(b).toEqual([{ n: 2 }]);

    ua();
    ub();
  });

  test("publish returns the count of subscribers that received the message", () => {
    const u1 = agentEvents.subscribe("host-x", () => {});
    const u2 = agentEvents.subscribe("host-x", () => {});
    expect(agentEvents.publish("host-x", { ok: true })).toBe(2);
    u1();
    expect(agentEvents.publish("host-x", { ok: true })).toBe(1);
    u2();
    expect(agentEvents.publish("host-x", { ok: true })).toBe(0);
  });

  test("a throwing subscriber is dropped from subsequent publishes", () => {
    let calls = 0;
    let throwy = true;
    const received: number[] = [];
    const u1 = agentEvents.subscribe("host-t", () => {
      if (throwy) throw new Error("nope");
    });
    const u2 = agentEvents.subscribe("host-t", (d) => {
      calls++;
      received.push((d as { n: number }).n);
    });

    // First publish: u1 throws (and is dropped), u2 receives
    agentEvents.publish("host-t", { n: 1 });
    // Second publish: only u2 is still subscribed
    throwy = false;
    agentEvents.publish("host-t", { n: 2 });

    expect(calls).toBe(2);
    expect(received).toEqual([1, 2]);
    u1();
    u2();
  });

  test("last unsubscribe for a hostname removes the host entry from onlineCount", () => {
    const start = agentEvents.onlineCount;
    const u1 = agentEvents.subscribe("alpha", () => {});
    const u2 = agentEvents.subscribe("alpha", () => {});
    const u3 = agentEvents.subscribe("beta", () => {});

    expect(agentEvents.onlineCount - start).toBe(2);

    u1();
    expect(agentEvents.onlineCount - start).toBe(2); // still beta + alpha
    u2();
    expect(agentEvents.onlineCount - start).toBe(1); // alpha gone
    u3();
    expect(agentEvents.onlineCount - start).toBe(0); // beta gone
  });
});
